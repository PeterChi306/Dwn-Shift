import unreal, os
L = unreal.log_warning
L('[PROBE] ==== start ====')
L('[PROBE] engine %s' % unreal.SystemLibrary.get_engine_version())
for name in ('PCGGraph','PCGComponent','PCGVolume','PCGSplineSamplerSettings',
             'PCGSurfaceSamplerSettings','PCGStaticMeshSpawnerSettings',
             'PCGMeshSelectorWeighted','PCGMeshSelectorWeightedEntry',
             'PCGDataFromActorSettings','PCGSelfPruningSettings',
             'PCGTransformPointsSettings','PCGDensityFilterSettings',
             'PCGDifferenceSettings','PCGGraphFactory'):
    L('[PROBE] %-34s %s' % (name, hasattr(unreal, name)))
try:
    L('[PROBE] ParseActorComponents %s' % hasattr(unreal.PCGGetDataFromActorMode,'PARSE_ACTOR_COMPONENTS'))
    L('[PROBE] SplineSampling ON_HORIZONTAL %s' % hasattr(unreal.PCGSplineSamplingDimension,'ON_HORIZONTAL'))
except Exception as e:
    L('[PROBE] enum check failed %s' % e)
lvl='/Game/LosSanterra/Maps/L_LosSanterra'
L('[PROBE] level exists %s' % unreal.EditorAssetLibrary.does_asset_exist(lvl))
fbx=os.path.expanduser('~/Downloads/trees-house-in-the-woods-project/source/trees four hous uplode.fbx')
L('[PROBE] fbx exists %s' % os.path.exists(fbx))
L('[PROBE] ==== done ====')
