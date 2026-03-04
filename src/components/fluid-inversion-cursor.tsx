import React, { useEffect, useRef } from "react";

interface FluidInversionCursorProps {
  /** Simulation grid resolution */
  simResolution?: number;
  /** Dye resolution */
  dyeResolution?: number;
  /** Density dissipation (0-1) */
  densityDissipation?: number;
  /** Velocity dissipation (0-1) */
  velocityDissipation?: number;
  /** Pressure value */
  pressure?: number;
  /** Pressure solver iterations */
  pressureIterations?: number;
  /** Curl/vorticity strength */
  curl?: number;
  /** Splat radius */
  splatRadius?: number;
  /** Splat force multiplier */
  splatForce?: number;
  /** Cursor dot size in px */
  cursorSize?: number;
  /** Custom className for the container */
  className?: string;
  /** Content to render (displayed behind the fluid) */
  children?: React.ReactNode;
}

const FluidInversionCursor = ({
  simResolution = 128,
  dyeResolution = 540,
  densityDissipation = 0.99,
  velocityDissipation = 0.99,
  pressure = 1.0,
  pressureIterations = 20,
  curl: curlStrength = 30,
  splatRadius = 0.4,
  splatForce = 4000,
  cursorSize = 100,
  className,
  children,
}: FluidInversionCursorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const CFG = {
      SIM_RESOLUTION: simResolution,
      DYE_RESOLUTION: dyeResolution,
      DENSITY_DISSIPATION: densityDissipation,
      VELOCITY_DISSIPATION: velocityDissipation,
      PRESSURE: pressure,
      PRESSURE_ITERATIONS: pressureIterations,
      CURL: curlStrength,
      SPLAT_RADIUS: splatRadius,
      SPLAT_FORCE: splatForce,
      PAUSED: false,
    };

    // WebGL bootstrap
    function getWebGLContext(c: HTMLCanvasElement) {
      const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
      let gl = c.getContext("webgl2", params) as WebGL2RenderingContext | null;
      const isWebGL2 = !!gl;
      if (!isWebGL2) gl = (c.getContext("webgl", params) || c.getContext("experimental-webgl", params)) as WebGL2RenderingContext | null;
      if (!gl) return null;

      let halfFloat: any, supportLinearFiltering: any;
      if (isWebGL2) {
        gl.getExtension("EXT_color_buffer_float");
        supportLinearFiltering = gl.getExtension("OES_texture_float_linear");
      } else {
        halfFloat = gl.getExtension("OES_texture_half_float");
        supportLinearFiltering = gl.getExtension("OES_texture_half_float_linear");
      }
      gl.clearColor(0, 0, 0, 0);
      const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;

      let formatRGBA: any, formatRG: any, formatR: any;
      if (isWebGL2) {
        formatRGBA = getSupportedFormat(gl, (gl as any).RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, (gl as any).RG16F, (gl as any).RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, (gl as any).R16F, (gl as any).RED, halfFloatTexType);
      } else {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      }
      return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
    }

    function getSupportedFormat(gl: WebGL2RenderingContext, internalFormat: number, format: number, type: number): any {
      if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
        switch (internalFormat) {
          case (gl as any).R16F: return getSupportedFormat(gl, (gl as any).RG16F, (gl as any).RG, type);
          case (gl as any).RG16F: return getSupportedFormat(gl, (gl as any).RGBA16F, gl.RGBA, type);
          default: return null;
        }
      }
      return { internalFormat, format };
    }

    function supportRenderTextureFormat(gl: WebGL2RenderingContext, internalFormat: number, format: number, type: number) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }

    const ctx = getWebGLContext(canvas);
    if (!ctx) return;
    const { gl, ext } = ctx;

    // Shader helpers
    function addKeywords(source: string, keywords?: string[] | null) {
      if (!keywords) return source;
      let kw = "";
      keywords.forEach((k) => { kw += `#define ${k}\n`; });
      return kw + source;
    }

    function compileShader(type: number, source: string, keywords?: string[] | null) {
      source = addKeywords(source, keywords);
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    function createProgram(vertSrc: string, fragSrc: string, keywords?: string[] | null) {
      const program = gl.createProgram()!;
      gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertSrc, keywords));
      gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragSrc, keywords));
      gl.linkProgram(program);
      const uniforms: Record<string, WebGLUniformLocation | null> = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i)!.name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return { program, uniforms };
    }

    // GLSL sources
    const baseVertSrc = `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
      uniform vec2 texelSize;
      void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const copyFrag = `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; uniform sampler2D uTexture; void main(){gl_FragColor=texture2D(uTexture,vUv);}`;
    const clearFrag = `precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value; void main(){gl_FragColor=value*texture2D(uTexture,vUv);}`;
    const displayFrag = `precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTexture; void main(){vec3 c=texture2D(uTexture,vUv).rgb;float a=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c,a);}`;
    const splatFrag = `precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius; void main(){vec2 p=vUv-point.xy;p.x*=aspectRatio;vec3 splat=exp(-dot(p,p)/radius)*color;vec3 base=texture2D(uTarget,vUv).xyz;gl_FragColor=vec4(base+splat,1.0);}`;
    const advectionFrag = `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
      uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
      vec4 bilerp(sampler2D sam,vec2 uv,vec2 tSize){vec4 st;st.xy=floor(uv/tSize-0.5)+0.5;st.zw=st.xy+1.0;vec4 uvCoords=st*tSize.xyxy;vec4 a=texture2D(sam,uvCoords.xy);vec4 b=texture2D(sam,uvCoords.zy);vec4 c=texture2D(sam,uvCoords.xw);vec4 d=texture2D(sam,uvCoords.zw);vec2 f=fract(uv/tSize-0.5);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
      void main(){
        #ifdef MANUAL_FILTERING
          vec2 coord=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;
          gl_FragColor=dissipation*bilerp(uSource,coord,dyeTexelSize);
        #else
          vec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;
          gl_FragColor=dissipation*texture2D(uSource,coord);
        #endif
        gl_FragColor.a=1.0;
      }
    `;
    const divergenceFrag = `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).x;float R=texture2D(uVelocity,vR).x;float T=texture2D(uVelocity,vT).y;float B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;if(vL.x<0.0){L=-C.x;}if(vR.x>1.0){R=-C.x;}if(vT.y>1.0){T=-C.y;}if(vB.y<0.0){B=-C.y;}float div=0.5*(R-L+T-B);gl_FragColor=vec4(div,0.0,0.0,1.0);}`;
    const curlFrag = `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).y;float R=texture2D(uVelocity,vR).y;float T=texture2D(uVelocity,vT).x;float B=texture2D(uVelocity,vB).x;float vorticity=R-L-T+B;gl_FragColor=vec4(0.5*vorticity,0.0,0.0,1.0);}`;
    const vorticityFrag = `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uVelocity;uniform sampler2D uCurl;uniform float curl;uniform float dt;void main(){float L=texture2D(uCurl,vL).x;float R=texture2D(uCurl,vR).x;float T=texture2D(uCurl,vT).x;float B=texture2D(uCurl,vB).x;float C=texture2D(uCurl,vUv).x;vec2 force=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));force/=length(force)+0.0001;force*=curl*C;force.y*=-1.0;vec2 vel=texture2D(uVelocity,vUv).xy;gl_FragColor=vec4(vel+force*dt,0.0,1.0);}`;
    const pressureFrag = `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uPressure;uniform sampler2D uDivergence;void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;float divergence=texture2D(uDivergence,vUv).x;float p=(L+R+B+T-divergence)*0.25;gl_FragColor=vec4(p,0.0,0.0,1.0);}`;
    const gradientSubtractFrag = `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uPressure;uniform sampler2D uVelocity;void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;vec2 vel=texture2D(uVelocity,vUv).xy;vel.xy-=vec2(R-L,T-B);gl_FragColor=vec4(vel,0.0,1.0);}`;

    // Compile programs
    const programs = {
      copy: createProgram(baseVertSrc, copyFrag),
      clear: createProgram(baseVertSrc, clearFrag),
      display: createProgram(baseVertSrc, displayFrag),
      splat: createProgram(baseVertSrc, splatFrag),
      advection: createProgram(baseVertSrc, advectionFrag, ext.supportLinearFiltering ? null : ["MANUAL_FILTERING"]),
      divergence: createProgram(baseVertSrc, divergenceFrag),
      curl: createProgram(baseVertSrc, curlFrag),
      vorticity: createProgram(baseVertSrc, vorticityFrag),
      pressure: createProgram(baseVertSrc, pressureFrag),
      gradientSubtract: createProgram(baseVertSrc, gradientSubtractFrag),
    };

    // Geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    const blit = (target: any, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      if (clear) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    // FBO helpers
    function createFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        texture, fbo, width: w, height: h,
        texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
        attach(id: number) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
      };
    }

    function createDoubleFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
      let fbo1 = createFBO(w, h, internalFormat, format, type, param);
      let fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
        get read() { return fbo1; },
        get write() { return fbo2; },
        swap() { const tmp = fbo1; fbo1 = fbo2; fbo2 = tmp; },
      };
    }

    function resizeFBO(target: any, w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
      const newFBO = createFBO(w, h, internalFormat, format, type, param);
      const { program, uniforms } = programs.copy;
      gl.useProgram(program);
      gl.uniform1i(uniforms.uTexture, target.attach(0));
      blit(newFBO);
      return newFBO;
    }

    function resizeDoubleFBO(target: any, w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
      if (target.width === w && target.height === h) return target;
      const fbo1 = resizeFBO(target.read, w, h, internalFormat, format, type, param);
      const fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
        get read() { return fbo1; },
        get write() { return fbo2; },
        swap() { let t = fbo1; /* no-op for type, handled by closure */ },
      };
    }

    function getResolution(resolution: number) {
      let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
      const min = Math.round(resolution);
      const max = Math.round(resolution * aspectRatio);
      return gl.drawingBufferWidth > gl.drawingBufferHeight
        ? { width: max, height: min }
        : { width: min, height: max };
    }

    // State
    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    let density: any, velocity: any, divergenceFBO: any, curlFBO: any, pressureFBO: any;

    function initFramebuffers() {
      const simRes = getResolution(CFG.SIM_RESOLUTION);
      const dyeRes = getResolution(CFG.DYE_RESOLUTION);
      if (!density) {
        density = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        divergenceFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        curlFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        pressureFBO = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      } else {
        density = resizeDoubleFBO(density, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      }
    }

    function resizeCanvas() {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      return true;
    }

    // Simulation step
    function step(dt: number) {
      gl.disable(gl.BLEND);
      // Curl
      {
        const { program, uniforms } = programs.curl;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(uniforms.uVelocity!, velocity.read.attach(0));
        blit(curlFBO);
      }
      // Vorticity
      {
        const { program, uniforms } = programs.vorticity;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(uniforms.uVelocity!, velocity.read.attach(0));
        gl.uniform1i(uniforms.uCurl!, curlFBO.attach(1));
        gl.uniform1f(uniforms.curl!, CFG.CURL);
        gl.uniform1f(uniforms.dt!, dt);
        blit(velocity.write);
        velocity.swap();
      }
      // Divergence
      {
        const { program, uniforms } = programs.divergence;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(uniforms.uVelocity!, velocity.read.attach(0));
        blit(divergenceFBO);
      }
      // Clear pressure
      {
        const { program, uniforms } = programs.clear;
        gl.useProgram(program);
        gl.uniform1i(uniforms.uTexture!, pressureFBO.read.attach(0));
        gl.uniform1f(uniforms.value!, CFG.PRESSURE);
        blit(pressureFBO.write);
        pressureFBO.swap();
      }
      // Pressure solve
      {
        const { program, uniforms } = programs.pressure;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(uniforms.uDivergence!, divergenceFBO.attach(0));
        for (let i = 0; i < CFG.PRESSURE_ITERATIONS; i++) {
          gl.uniform1i(uniforms.uPressure!, pressureFBO.read.attach(1));
          blit(pressureFBO.write);
          pressureFBO.swap();
        }
      }
      // Gradient subtract
      {
        const { program, uniforms } = programs.gradientSubtract;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(uniforms.uPressure!, pressureFBO.read.attach(0));
        gl.uniform1i(uniforms.uVelocity!, velocity.read.attach(1));
        blit(velocity.write);
        velocity.swap();
      }
      // Advect velocity
      {
        const { program, uniforms } = programs.advection;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        if (!ext.supportLinearFiltering) gl.uniform2f(uniforms.dyeTexelSize!, velocity.texelSizeX, velocity.texelSizeY);
        const vId = velocity.read.attach(0);
        gl.uniform1i(uniforms.uVelocity!, vId);
        gl.uniform1i(uniforms.uSource!, vId);
        gl.uniform1f(uniforms.dt!, dt);
        gl.uniform1f(uniforms.dissipation!, CFG.VELOCITY_DISSIPATION);
        blit(velocity.write);
        velocity.swap();
      }
      // Advect density
      {
        const { program, uniforms } = programs.advection;
        gl.useProgram(program);
        gl.uniform2f(uniforms.texelSize!, velocity.texelSizeX, velocity.texelSizeY);
        if (!ext.supportLinearFiltering) gl.uniform2f(uniforms.dyeTexelSize!, density.texelSizeX, density.texelSizeY);
        gl.uniform1i(uniforms.uVelocity!, velocity.read.attach(0));
        gl.uniform1i(uniforms.uSource!, density.read.attach(1));
        gl.uniform1f(uniforms.dt!, dt);
        gl.uniform1f(uniforms.dissipation!, CFG.DENSITY_DISSIPATION);
        blit(density.write);
        density.swap();
      }
    }

    function splatFn(x: number, y: number, dx: number, dy: number, color: { r: number; g: number; b: number }) {
      const { program, uniforms } = programs.splat;
      gl.useProgram(program);
      gl.uniform1i(uniforms.uTarget!, velocity.read.attach(0));
      gl.uniform1f(uniforms.aspectRatio!, canvas.width / canvas.height);
      gl.uniform2f(uniforms.point!, x / canvas.width, 1.0 - y / canvas.height);
      gl.uniform3f(uniforms.color!, dx, -dy, 0.0);
      const ar = canvas.width / canvas.height;
      const correctedRadius = ar > 1 ? (CFG.SPLAT_RADIUS / 100.0) * ar : CFG.SPLAT_RADIUS / 100.0;
      gl.uniform1f(uniforms.radius!, correctedRadius);
      blit(velocity.write);
      velocity.swap();
      gl.uniform1i(uniforms.uTarget!, density.read.attach(0));
      gl.uniform3f(uniforms.color!, color.r, color.g, color.b);
      blit(density.write);
      density.swap();
    }

    function render() {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      const { program, uniforms } = programs.display;
      gl.useProgram(program);
      gl.uniform1i(uniforms.uTexture!, density.read.attach(0));
      blit(null);
    }

    // Pointer
    const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, down: false };
    const color = { r: 1.0, g: 1.0, b: 1.0 };

    function updatePointer(posX: number, posY: number) {
      if (pointer.x === 0 && pointer.y === 0) {
        pointer.x = posX; pointer.y = posY;
      }
      const prevX = pointer.x;
      const prevY = pointer.y;
      pointer.x = posX; pointer.y = posY;
      pointer.dx = (posX - prevX) * 5.0;
      pointer.dy = (posY - prevY) * 5.0;
      pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      updatePointer(e.clientX - rect.left, e.clientY - rect.top);
      pointer.down = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const rect = container.getBoundingClientRect();
      updatePointer(t.clientX - rect.left, t.clientY - rect.top);
      pointer.down = true;
    };

    const handleResize = () => {
      if (resizeCanvas()) initFramebuffers();
    };

    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const rect = container.getBoundingClientRect();
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      pointer.x = x;
      pointer.y = y;
      pointer.down = true;
      pointer.moved = true;
      
      // Force a large splat on touch start
      splatFn(x, y, (Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150, color);
    };

    const handleTouchEnd = () => {
      pointer.down = false;
    };

    const handleMouseDown = () => { pointer.down = true; };
    const handleMouseUp = () => { pointer.down = false; };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("resize", handleResize);

    resizeCanvas();
    initFramebuffers();

    let lastTime = Date.now();
    let animId: number;

    function update() {
      if (resizeCanvas()) initFramebuffers();
      const now = Date.now();
      let dt = (now - lastTime) / 1000;
      dt = Math.min(dt, 0.016666);
      lastTime = now;

      if (!CFG.PAUSED) {
        if (pointer.down) {
          // If moved, use velocity. If stationary but down, use jitter for "boiling" effect
          const forceX = pointer.moved ? pointer.dx : (Math.random() - 0.5) * 30;
          const forceY = pointer.moved ? pointer.dy : (Math.random() - 0.5) * 30;
          splatFn(pointer.x, pointer.y, forceX * CFG.SPLAT_FORCE / 1000, forceY * CFG.SPLAT_FORCE / 1000, color);
          pointer.moved = false;
        }
        step(dt);
        render();
      }
      animId = requestAnimationFrame(update);
    }

    update();

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, [simResolution, dyeResolution, densityDissipation, velocityDissipation, pressure, pressureIterations, curlStrength, splatRadius, splatForce]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden pointer-events-auto ${className ?? ""}`}
      style={{ background: "transparent" }}
    >
      {children}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 9999,
          mixBlendMode: "difference",
        }}
      />
    </div>
  );
};

export { FluidInversionCursor };
