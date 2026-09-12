import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
window.THREE=THREE;window.BASELINE_ENGINE={GLTFLoader,DRACOLoader,MarchingCubes,mergeGeometries,cloneSkeleton:clone};
