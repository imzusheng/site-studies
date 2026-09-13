/* A single HDR presentation pass: filmic highlights, edge AA, restrained glow and grain. */
window.createCourtPresentation=function(T,renderer){
 const gl=renderer.getContext(),hdr=renderer.extensions.has('EXT_color_buffer_float');
 const supported=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,hdr?gl.RGBA16F:gl.RGBA8,gl.SAMPLES)||[]);
 const target=new T.WebGLRenderTarget(1,1,{type:hdr?T.HalfFloatType:T.UnsignedByteType,depthBuffer:true,samples:0});
 const uniforms={image:{value:target.texture},pixel:{value:new T.Vector2(1,1)},time:{value:0},exposure:{value:.93},glow:{value:.035}};
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms,
 vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`varying vec2 uv0;uniform sampler2D image;uniform vec2 pixel;uniform float time;uniform float exposure;uniform float glow;
 float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
 vec3 color(vec2 uv){return texture2D(image,uv).rgb;}
 void main(){vec2 uv=uv0;vec3 c=color(uv);vec3 n=color(uv+vec2(0.,pixel.y)),s=color(uv-vec2(0.,pixel.y)),e=color(uv+vec2(pixel.x,0.)),w=color(uv-vec2(pixel.x,0.));
 float hi=max(luma(c),max(max(luma(n),luma(s)),max(luma(e),luma(w))));float lo=min(luma(c),min(min(luma(n),luma(s)),min(luma(e),luma(w))));
 float edge=smoothstep(.06,.20,(hi-lo)/max(hi,.01));c=mix(c,(n+s+e+w+c*4.)/8.,edge*.44);
 vec3 bloom=vec3(0.);for(int i=0;i<4;i++){float a=float(i)*1.570796;vec3 v=color(uv+vec2(cos(a),sin(a))*pixel*5.);bloom+=max(v-vec3(1.15),vec3(0.));}c+=bloom*glow*.25;
 c*=exposure;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);c=clamp(c,0.,1.);c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
 vec2 d=(uv-.5)*vec2(.90,1.);float vignette=1.-.19*dot(d,d);c*=vignette;
 float grain=fract(sin(dot(gl_FragCoord.xy+time*.03,vec2(12.9898,78.233)))*43758.5453)-.5;c+=grain*.003;gl_FragColor=vec4(c,1.);}`});
 const scene=new T.Scene();scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));const cam=new T.Camera();
 const api={last:{calls:0,triangles:0},resize(){const v=renderer.getDrawingBufferSize(new T.Vector2());target.setSize(v.x,v.y);uniforms.pixel.value.set(1/v.x,1/v.y)},quality(level){const desired=level==='high'?4:level==='eco'?0:2;target.samples=Math.max(0,...supported.filter(n=>n<=desired));target.dispose();api.resize()},render(world,camera,time){uniforms.time.value=time;renderer.setRenderTarget(target);renderer.render(world,camera);api.last={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};renderer.setRenderTarget(null);renderer.render(scene,cam)},dispose(){target.dispose();material.dispose()}};api.resize();return api;
};
