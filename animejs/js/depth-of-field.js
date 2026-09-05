import * as THREE from '/vendor/three.module.js';

// Linear-depth circle of confusion. HTML remains outside this optical pass.
export function createDepthOfField(renderer, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const uniforms = {
    colorMap: { value: target.texture }, depthMap: { value: target.depthTexture },
    resolution: { value: new THREE.Vector2(1, 1) }, focus: { value: 180 },
    projectionInverse: { value: camera.projectionMatrixInverse.clone() }, projectionScale: { value: 1 },
    nearClip: { value: camera.near }, farClip: { value: camera.far }, aperture: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D colorMap, depthMap;
      uniform vec2 resolution;
      uniform mat4 projectionInverse;
      uniform float projectionScale;
      uniform float focus, nearClip, farClip, aperture;
      float depthAt(vec2 uv){float d=texture2D(depthMap,uv).x;return nearClip*farClip/(farClip-d*(farClip-nearClip));}
      vec3 positionAt(vec2 uv){
        vec4 p=projectionInverse*vec4(uv*2.-1.,texture2D(depthMap,uv).x*2.-1.,1.);
        return p.xyz/p.w;
      }
      void main(){
        vec3 origin=positionAt(vUv);
        vec3 normal=normalize(cross(dFdx(origin),dFdy(origin)));
        float z=depthAt(vUv);
        float blur=clamp(max(0.,abs(z-focus)-10.)/max(z,1.)*aperture,0.,8.);
        vec3 sum=texture2D(colorMap,vUv).rgb;float total=1.;
        for(int i=0;i<32;i++){
          float f=float(i)+.5;float angle=f*2.39996323;
          vec2 delta=vec2(cos(angle),sin(angle))*sqrt(f/32.)*blur/resolution;
          vec2 uv=clamp(vUv+delta,vec2(0.),vec2(1.));
          float sampleDepth=depthAt(uv);
          float weight=sampleDepth<z-15.? .25:1.;
          sum+=texture2D(colorMap,uv).rgb*weight;total+=weight;
        }
        vec3 result=sum/total;
        // Short-range contact occlusion gives matte parts depth without a cast
        // spotlight shadow. It stays local to the actual nearby geometry.
        float occlusion=0.;
        float radius=clamp(4.*projectionScale*resolution.y/(2.*max(z,1.)),2.,48.);
        for(int i=0;i<12;i++){
          float f=float(i)+.5;
          vec2 offset=vec2(cos(f*2.399963),sin(f*2.399963))*sqrt(f/12.)*radius/resolution;
          vec3 delta=positionAt(clamp(vUv+offset,vec2(.001),vec2(.999)))-origin;
          float len=length(delta);
          occlusion+=max(0.,dot(normal,delta/max(len,.001))-.12)*(1.-smoothstep(1.,5.,len));
        }
        result*=1.-min(.42,occlusion*.095);
        // A quiet, broad atmospheric field stays behind the real geometry.
        // It has no visible light cone and never lifts the white drawing scenes.
        float atmosphere=smoothstep(farClip*.92,farClip*.99,z);
        float halo=exp(-dot((vUv-vec2(.64,.57))*vec2(1.25,1.),(vUv-vec2(.64,.57))*vec2(1.25,1.))*3.8);
        result+=vec3(.008,.013,.018)*halo*atmosphere;
        vec3 glow=vec3(0.);
        for(int i=0;i<8;i++){
          float angle=float(i)*.785398;
          vec2 d=vec2(cos(angle),sin(angle))*13./resolution;
          glow+=max(texture2D(colorMap,clamp(vUv+d,vec2(0.),vec2(1.))).rgb-.8,0.);
        }
        result+=glow*.009;
        float vignette=1.-.12*smoothstep(.2,.8,length((vUv-.5)*vec2(1.,.8)));
        gl_FragColor=vec4(result*vignette,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const quadCamera = new THREE.Camera();
  return {
    resize() {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      target.setSize(size.x, size.y); uniforms.resolution.value.copy(size);
    },
    render(world, focalPoint, amount) {
      if (amount < .001) { renderer.render(world, camera); return; }
      uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
      uniforms.projectionScale.value=camera.projectionMatrix.elements[5];
      uniforms.focus.value = -focalPoint.clone().applyMatrix4(camera.matrixWorldInverse).z;
      uniforms.aperture.value = amount * 28;
      renderer.setRenderTarget(target); renderer.render(world, camera);
      renderer.setRenderTarget(null); renderer.render(scene, quadCamera);
    },
  };
}
