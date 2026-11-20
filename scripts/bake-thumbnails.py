#!/usr/bin/env python3
"""Capture a complete live High frame for shared desktop/mobile scene cards.
Native EGL/GLES, Pillow and NumPy are build-time tools only. No progressive
photo sampling, fixed rendering delay, or partially initialized tiles are used.
"""
import argparse,base64,ctypes as C,ctypes.util,json,os,time,io,hashlib,fcntl,sys
from pathlib import Path
import numpy as np
from PIL import Image
os.environ.setdefault('EGL_PLATFORM','surfaceless');os.environ.setdefault('LP_NUM_THREADS','1')
P,I,U,F=C.c_void_p,C.c_int,C.c_uint,C.c_float

def api(lib,name,result,args):
 fn=getattr(lib,name);fn.restype,fn.argtypes=result,args;return fn

def bake(args):
 lock=open(str(args.snapshot)+'.lock','a');fcntl.flock(lock,fcntl.LOCK_EX)
 data=json.loads(Path(args.snapshot).read_text());output=Path(args.output)
 if not args.force and output.exists():
  record_path=output.with_suffix('.render.json');manifest_path=output.parent/'thumbnail-manifest.json';record=None
  if record_path.exists():record=json.loads(record_path.read_text())
  elif manifest_path.exists():record=json.loads(manifest_path.read_text()).get('scenes',{}).get(data['id'])
  if record and record.get('renderHash',record.get('sourceHash'))==data.get('renderHash',data['sourceHash']) and record.get('preset')=='quick' and record.get('width')==args.width and record.get('height')==args.height and record.get('imageHash')==hashlib.sha256(output.read_bytes()).hexdigest():
   record['sourceHash']=data['sourceHash'] # Identical recorded frame, current source revision.
   record_path.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True);return
 textures=json.loads((Path(args.snapshot).parent/'textures.json').read_text())
 egl=C.CDLL(ctypes.util.find_library('EGL'));gl=C.CDLL(ctypes.util.find_library('GLESv2') or ctypes.util.find_library('GL'))
 display=api(egl,'eglGetDisplay',P,[P])(None);major,minor=I(),I();assert api(egl,'eglInitialize',U,[P,C.POINTER(I),C.POINTER(I)])(display,C.byref(major),C.byref(minor));assert api(egl,'eglBindAPI',U,[U])(0x30A0)
 cfg,num=P(),I();attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038);assert api(egl,'eglChooseConfig',U,[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)])(display,attrs,C.byref(cfg),1,C.byref(num)) and num.value
 surface=api(egl,'eglCreatePbufferSurface',P,[P,P,C.POINTER(I)])(display,cfg,(I*5)(0x3057,args.width,0x3056,args.height,0x3038));context=api(egl,'eglCreateContext',P,[P,P,P,C.POINTER(I)])(display,cfg,None,(I*3)(0x3098,3,0x3038));assert api(egl,'eglMakeCurrent',U,[P,P,P,P])(display,surface,surface,context)
 def shader(kind,source):
  s=api(gl,'glCreateShader',U,[U])(kind);txt=C.c_char_p(source.encode());api(gl,'glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)])(s,1,C.byref(txt),None);api(gl,'glCompileShader',None,[U])(s);ok=I();api(gl,'glGetShaderiv',None,[U,U,C.POINTER(I)])(s,0x8B81,C.byref(ok))
  if not ok.value:
   msg=C.create_string_buffer(65536);api(gl,'glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p])(s,len(msg),None,msg);raise RuntimeError(msg.value.decode())
  return s
 compile_start=time.monotonic();program=api(gl,'glCreateProgram',U,[])()
 for kind,key in [(0x8B31,'vertex'),(0x8B30,'fragment')]:api(gl,'glAttachShader',None,[U,U])(program,shader(kind,data[key]))
 api(gl,'glLinkProgram',None,[U])(program);ok=I();api(gl,'glGetProgramiv',None,[U,U,C.POINTER(I)])(program,0x8B82,C.byref(ok));assert ok.value,'Link failed';api(gl,'glUseProgram',None,[U])(program)
 loc=api(gl,'glGetUniformLocation',I,[U,C.c_char_p]);locations={}
 def location(name):
  if name not in locations:locations[name]=loc(program,name.encode())
  return locations[name]
 def uniform(name,method,values):
  address=location(name)
  if address<0:return
  if 'Matrix' in method:
   count=int(method[13]);values0=values[-1];api(gl,'gl'+method[0].upper()+method[1:],None,[I,I,U,C.POINTER(F)])(address,len(values0)//(count*count),False,(F*len(values0))(*values0))
  elif method.endswith('fv'):
   count=int(method[7]);values0=values[0];api(gl,'gl'+method[0].upper()+method[1:],None,[I,I,C.POINTER(F)])(address,len(values0)//count,(F*len(values0))(*values0))
  else:
   kind=I if method.endswith('i') else F;api(gl,'gl'+method[0].upper()+method[1:],None,[I]+[kind]*len(values))(address,*values)
 for item in data['uniforms']:uniform(item['name'],item['method'],item['args'])
 uniform('uResolution','uniform2f',[args.width,args.height]);uniform('uRayViewport','uniform4f',[0,0,0,0]);uniform('uProjectionMode','uniform1i',[0]);uniform('uDetail','uniform1f',[2]);uniform('uSteps','uniform1i',[192]);uniform('uPhotoOffset','uniform2f',[0,0]);uniform('uPhotoJitter','uniform2f',[0,0])
 vbo=U();api(gl,'glGenBuffers',None,[I,C.POINTER(U)])(1,C.byref(vbo));api(gl,'glBindBuffer',None,[U,U])(0x8892,vbo);verts=(F*6)(-1,-1,3,-1,-1,3);api(gl,'glBufferData',None,[U,C.c_ssize_t,P,U])(0x8892,C.sizeof(verts),verts,0x88E4);attribute=api(gl,'glGetAttribLocation',I,[U,C.c_char_p])(program,b'aPosition');api(gl,'glEnableVertexAttribArray',None,[U])(attribute);api(gl,'glVertexAttribPointer',None,[U,I,U,U,I,P])(attribute,2,0x1406,False,0,None)
 def texture(uri,unit):
  im=Image.open(io.BytesIO(base64.b64decode(uri.split(',')[1]))).convert('RGB');pixels=np.asarray(im);tex=U();api(gl,'glGenTextures',None,[I,C.POINTER(U)])(1,C.byref(tex));api(gl,'glActiveTexture',None,[U])(0x84C0+unit);api(gl,'glBindTexture',None,[U,U])(0x0DE1,tex);api(gl,'glPixelStorei',None,[U,I])(0x0CF5,1);api(gl,'glTexImage2D',None,[U,I,I,I,I,I,U,U,P])(0x0DE1,0,0x1907,im.width,im.height,0,0x1907,0x1401,pixels.ctypes.data)
  for pname,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:api(gl,'glTexParameteri',None,[U,U,I])(0x0DE1,pname,value)
 if data['features'].get('planetary'):
  texture(textures['atlas'],0);focus=str(data['focusSurfaceId']);texture(textures['maps'].get(focus,textures['atlas']),1);uniform('uPlanetAtlas','uniform1i',[0]);uniform('uPlanetFocus','uniform1i',[1]);uniform('uPlanetAtlasReady','uniform1f',[1]);uniform('uPlanetFocusId','uniform1f',[int(focus) if focus in textures['maps'] else 0])
 draw=api(gl,'glDrawArrays',None,[U,I,I]);viewport=api(gl,'glViewport',None,[I,I,I,I]);read=api(gl,'glReadPixels',None,[I,I,I,I,U,U,P]);error=api(gl,'glGetError',U,[])
 # Force the driver's deferred code generation before measuring pixel throughput.
 # This is compiler work, not an artificially delayed rendering budget.
 viewport(0,0,8,8);draw(4,0,3);warm=np.zeros((8,8,4),np.uint8);read(0,0,8,8,0x1908,0x1401,warm.ctypes.data)
 started=time.monotonic();compile_seconds=started-compile_start
 width,height=args.width,args.height
 pixels=np.zeros((height,width,4),np.uint8)
 viewport(0,0,width,height);draw(4,0,3);read(0,0,width,height,0x1908,0x1401,pixels.ctypes.data)
 err=error()
 if err:raise RuntimeError('GL error '+hex(err))
 if not np.all(pixels[:,:,3]==255):raise RuntimeError('Incomplete screenshot: unwritten or non-opaque pixels')
 elapsed=time.monotonic()-started
 image=Image.fromarray(pixels[::-1,:,:3],'RGB')
 if data.get('overlay'):
  sys.dont_write_bytecode=True
  from thumbnail_overlay import composite
  image=composite(image,data['overlay'],(data['width'],data['height']))
 output.parent.mkdir(parents=True,exist_ok=True);temporary=output.with_name(output.name+'.'+str(os.getpid())+'.tmp');encoded=io.BytesIO();image.save(encoded,'WEBP',quality=92,method=6)
 with temporary.open('wb') as stream:stream.write(encoded.getvalue());stream.flush();os.fsync(stream.fileno())
 temporary.replace(output)
 report={'scene':data['id'],'sourceHash':data['sourceHash'],'renderHash':data.get('renderHash',data['sourceHash']),'imageHash':hashlib.sha256(output.read_bytes()).hexdigest(),'width':width,'height':height,'preset':'quick','renderSeconds':round(elapsed,3),'compileSeconds':round(compile_seconds,3),'completePasses':1,'minimumPixelSamples':1,'baseSteps':192,'detail':2,'backend':'native EGL / actual live High GLSL'}
 if data.get('overlay'):report['backend']+=' + live SVG locators'
 record_path=output.with_suffix('.render.json');temporary_record=record_path.with_name(record_path.name+'.'+str(os.getpid())+'.tmp');temporary_record.write_text(json.dumps(report,indent=2)+'\n');temporary_record.replace(record_path);print(json.dumps(report),flush=True)
 api(egl,'eglMakeCurrent',U,[P,P,P,P])(display,None,None,None);api(egl,'eglDestroyContext',U,[P,P])(display,context);api(egl,'eglDestroySurface',U,[P,P])(display,surface);api(egl,'eglTerminate',U,[P])(display)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('snapshot');parser.add_argument('output');parser.add_argument('--width',type=int,default=640);parser.add_argument('--height',type=int,default=422);parser.add_argument('--force',action='store_true');bake(parser.parse_args())
