"""Rewrite the existing Landscape's heights from the exported heightmap PNG.

This replaces the manual "Landscape mode > Manage > New > Import from File"
step, which is 7 hand-typed fields and the easiest thing in the pipeline to get
wrong. It does NOT create a Landscape -- ALandscape::Import is not a UFUNCTION
and there is still no script path to it. It re-heights the one already in the
level, which is all that is ever actually stale after regrade_network.py moves
node heights.

Precondition: the Landscape exists with the right location/scale. Run
fix_landscape.py first if that is in doubt; this script verifies and refuses
rather than silently producing a shifted terrain.

How the height data gets in: LandscapeImportHeightmapFromRenderTarget is the only
scriptable entry point, so the PNG goes
    16-bit PNG -> uncompressed G16 Texture2D -> UI material -> R32f render target
and the R channel is read back as 0..1 and scaled to the 16-bit height range.
R32f is chosen so the 16-bit source survives the round trip; an 8-bit target
would quantise 212 m of Z into 256 steps (~0.8 m) and reintroduce the bug.

Verify with ./unreal/run.sh ground -- that traces real collision and is the only
check that catches a stale Landscape. Expect max to fall from ~19 m to <1 m.

Run headless with the editor CLOSED:

    ./unreal/run.sh heights
"""
import json
import os

import unreal

EXPORTS = '/Users/peterchi/Desktop/Dwn SHIFT/output/unreal'
LEVEL = '/Game/LosSanterra/Maps/L_LosSanterra'
TMP_DIR = '/Game/LosSanterra/_HeightImport'
TEX = TMP_DIR + '/T_Heightmap'
MAT = TMP_DIR + '/M_HeightBlit'
RT = TMP_DIR + '/RT_Heightmap'

assets = unreal.EditorAssetLibrary


def log(message):
    unreal.log_warning('[Los Santerra] {}'.format(message))


# UE 5.8 exposes UKismetRenderingLibrary to Python as unreal.RenderingLibrary.
RENDERING = getattr(unreal, 'RenderingLibrary', None) or unreal.KismetRenderingLibrary


def load_meta():
    with open(os.path.join(EXPORTS, 'los-santerra-terrain.json')) as handle:
        return json.load(handle)['unreal']


def find_landscape(meta):
    """The one Landscape, checked against the export before we touch heights."""
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    found = [a for a in actors.get_all_level_actors()
             if isinstance(a, unreal.LandscapeProxy)]
    if len(found) != 1:
        log('expected exactly 1 Landscape, found {} -- run fix_landscape.py'
            .format(len(found)))
        return None

    landscape = found[0]
    loc = landscape.get_actor_location()
    scale = landscape.get_actor_scale3d()
    want_loc = meta['landscapeLocation']
    bad = []
    for label, got, wanted in (('X', loc.x, want_loc[0]),
                               ('Y', loc.y, want_loc[1]),
                               ('Z', loc.z, want_loc[2])):
        if abs(got - wanted) > 1.0:
            bad.append('loc {} {:.1f} != {:.1f}'.format(label, got, wanted))
    for label, got, wanted in (('X', scale.x, meta['scaleX']),
                               ('Y', scale.y, meta['scaleY']),
                               ('Z', scale.z, meta['scaleZ'])):
        if abs(got - wanted) > 0.01:
            bad.append('scale {} {:.4f} != {:.4f}'.format(label, got, wanted))
    if bad:
        log('Landscape is misplaced, refusing to import heights into it:')
        for problem in bad:
            log('  {}'.format(problem))
        log('run fix_landscape.py first')
        return None

    log('Landscape OK at ({:.0f}, {:.0f}, {:.0f}) scale ({:.4f}, {:.4f}, {:.4f})'
        .format(loc.x, loc.y, loc.z, scale.x, scale.y, scale.z))
    return landscape


def import_heightmap_texture():
    """Import the PNG as an uncompressed, non-sRGB, unfiltered G16 texture."""
    png = os.path.join(EXPORTS, 'los-santerra-height.png')
    if not os.path.isfile(png):
        log('no heightmap at {}'.format(png))
        return None

    task = unreal.AssetImportTask()
    task.set_editor_property('filename', png)
    task.set_editor_property('destination_path', TMP_DIR)
    task.set_editor_property('destination_name', 'T_Heightmap')
    task.set_editor_property('automated', True)
    task.set_editor_property('replace_existing', True)
    task.set_editor_property('save', False)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    texture = assets.load_asset(TEX)
    if texture is None:
        log('heightmap texture failed to import')
        return None

    # Any of these left at defaults corrupts height data: sRGB applies a gamma
    # curve to what is not colour, compression throws away low bits, and
    # bilinear filtering plus mips smear neighbouring heights together.
    texture.set_editor_property('srgb', False)
    # TC_GRAYSCALE keeps a 16-bit PNG at G16. TC_VECTOR_DISPLACEMENTMAP sounds
    # right but forces BGRA8, which quantises 65535 height steps down to 255 --
    # 4.3 m of landscape per step, and roads land a uniform 0-2 m off the ground.
    texture.set_editor_property('compression_settings',
                                unreal.TextureCompressionSettings.TC_GRAYSCALE)
    texture.set_editor_property('mip_gen_settings',
                                unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
    texture.set_editor_property('filter', unreal.TextureFilter.TF_NEAREST)
    texture.set_editor_property('never_stream', True)
    assets.save_loaded_asset(texture, only_if_is_dirty=False)

    log('heightmap pixel format {}'.format(texture.get_editor_property('compression_settings')))
    width = texture.blueprint_get_size_x()
    height = texture.blueprint_get_size_y()
    log('heightmap texture {} x {}'.format(width, height))
    return texture, width, height


def build_blit_material(texture):
    """A UI-domain material that just passes the texture through.

    draw_material_to_render_target only accepts MD_UI, so the domain is not
    optional here.
    """
    if assets.does_asset_exist(MAT):
        assets.delete_asset(MAT)
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        'M_HeightBlit', TMP_DIR, unreal.Material, unreal.MaterialFactoryNew())
    material.set_editor_property('material_domain',
                                 unreal.MaterialDomain.MD_UI)

    sampler = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -400, 0)
    sampler.set_editor_property('texture', texture)

    # LandscapeImportHeightmapFromRenderTarget takes the height as
    # (uint16)LinearColor.R -- a RAW 0..65535 value, not a normalised 0..1 one.
    # The texture sample is 0..1, so without this multiply the whole landscape
    # imports as height 0 or 1.
    scale = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionMultiply, -200, 0)
    scale.set_editor_property('const_b', 65535.0)
    unreal.MaterialEditingLibrary.connect_material_expressions(
        sampler, 'RGB', scale, 'A')
    unreal.MaterialEditingLibrary.connect_material_property(
        scale, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(material)
    assets.save_loaded_asset(material, only_if_is_dirty=False)
    return material


def build_render_target(world, width, height):
    """RGBA32f so the 16-bit source survives; 8-bit would quantise to ~0.8 m.

    The importer accepts only RTF_RGBA16f, RTF_RGBA32f and RTF_RGBA8 -- plain
    R32f is rejected outright, and RGBA16f's 10-bit mantissa cannot hold 65535
    distinct values.

    Built transiently via RenderingLibrary rather than as a saved asset. Setting
    size_x/size_y on a real UTextureRenderTarget2D asset runs
    PostEditChangeProperty, which for any dimension over 2048 opens a
    "will use NMb, are you sure?" dialog -- and under -unattended that answers
    No, which CLAMPS both dimensions to 2048. The blit then silently imports a
    2048x2048 crop of a 3811x2541 heightmap.
    """
    target = RENDERING.create_render_target2d(
        world, width, height,
        unreal.TextureRenderTargetFormat.RTF_RGBA32F,
        unreal.LinearColor(0, 0, 0, 1), True)
    log('render target is {} x {}'.format(
        target.get_editor_property('size_x'),
        target.get_editor_property('size_y')))
    if target.get_editor_property('size_x') != width:
        log('render target came back the wrong size -- aborting')
        return None
    return target


def main():
    meta = load_meta()
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(LEVEL)

    landscape = find_landscape(meta)
    if landscape is None:
        return

    imported = import_heightmap_texture()
    if imported is None:
        return
    texture, width, height = imported

    material = build_blit_material(texture)
    target = build_render_target(landscape.get_world(), width, height)
    if target is None:
        return

    log('blitting {} x {} heightmap into RGBA32f render target'.format(width, height))
    RENDERING.clear_render_target2d(
        landscape, target, unreal.LinearColor(0, 0, 0, 1))
    RENDERING.draw_material_to_render_target(
        landscape, target, material)

    log('importing heights into {}'.format(landscape.get_actor_label()))
    ok = landscape.landscape_import_heightmap_from_render_target(target, False)
    log('LandscapeImportHeightmapFromRenderTarget returned {}'.format(ok))
    if not ok:
        log('height import refused -- Landscape unchanged, level not saved')
        return

    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    log('level saved')
    log('now run ./unreal/run.sh ground -- max should drop from ~19 m to <1 m')


main()
