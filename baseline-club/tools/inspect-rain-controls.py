import bpy,json
from pathlib import Path
a=bpy.data.objects['RIG-rain']
names=['Properties_IKFK','Properties_Character_Rain','FK-Spine','FK-Chest','FK-Spine1','FK-Spine2','FK-Neck','FK-Head','FK-Clavicle.R','FK-Upperarm.R','FK-Forearm.R','FK-Hand.R','FK-Thigh.R','FK-Shin.R','FK-Foot.R','FK-Index1.R','FK-Index2.R','FK-Index3.R','FK-Thumb1.R','FK-Thumb2.R','FK-Thumb3.R','Root','ROOT','Torso','Hips']
o={}
for n in names:
 if n not in a.pose.bones:continue
 b=a.pose.bones[n]
 o[n]={'props':{k:str(v) for k,v in b.items()},'rest':[list(r) for r in b.bone.matrix_local],'matrix':[list(r) for r in b.matrix],'basis':[list(r) for r in b.matrix_basis],'locks':[list(b.lock_location),list(b.lock_rotation)]}
o['drivers']=[{'path':d.data_path,'vars':[(v.name,[(t.data_path,t.bone_target) for t in v.targets]) for v in d.driver.variables]} for d in a.animation_data.drivers if any(s in d.data_path for s in ['Upperarm','Forearm','FK-Thigh','FK-Shin','IKFK'])][:100]
Path(__file__).resolve().parents[1].joinpath('.cache/rain-controls.json').write_text(json.dumps(o,indent=2),encoding='utf8')
print('CONTROL_COMPLETE')
