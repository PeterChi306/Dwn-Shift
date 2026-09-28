"""Remove the planted Los Santerra trees from the level. Meshes and JSON stay."""
import unreal

L = unreal.log_warning
TREE_TAG = unreal.Name('LosSanterraTrees')

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
level = actors.get_all_level_actors()

tagged = [a for a in level if TREE_TAG in a.tags]
by_label = [a for a in level
            if a not in tagged and a.get_actor_label().startswith('Trees_')]

L('[TREES] %d tagged tree actors, %d more matching Trees_*' % (len(tagged), len(by_label)))
for actor in tagged + by_label:
    actors.destroy_actor(actor)

foliage = [a for a in actors.get_all_level_actors()
           if isinstance(a, unreal.InstancedFoliageActor)]
L('[TREES] %d InstancedFoliageActor left (foliage painted outside this pipeline)' % len(foliage))

remaining = [a for a in actors.get_all_level_actors() if TREE_TAG in a.tags]
L('[TREES] removed %d actors, %d remaining' % (len(tagged) + len(by_label), len(remaining)))

unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
L('[TREES] level saved -- replant any time with unreal/build_los_santerra_trees.py')
