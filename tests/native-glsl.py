"""Optional native EGL compiler for real generated shaders, not a WebGL mock.

Reads [{name, vertex, fragment}] from stdin. Exit 77 means this host has no
usable EGL/GLES compiler; shader compilation or linkage errors always fail.
Only standard Python modules and existing system graphics libraries are used.
"""
import ctypes as C
import ctypes.util
import json
import os
import sys

os.environ.setdefault('EGL_PLATFORM', 'surfaceless')
P, I, U = C.c_void_p, C.c_int, C.c_uint
cases = json.load(sys.stdin)


def api(lib, name, result, args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = result, args
    return fn


try:
    egl = C.CDLL(ctypes.util.find_library('EGL') or 'libEGL.so.1')
    # Mesa distributions may expose GLES entry points through libGL without a
    # separate libGLESv2 package. The EGL context below is still an ES context.
    gl = C.CDLL(ctypes.util.find_library('GLESv2') or ctypes.util.find_library('GL') or 'libGLESv2.so.2')
    display = api(egl, 'eglGetDisplay', P, [P])(None)
    major, minor = I(), I()
    assert api(egl, 'eglInitialize', U, [P, C.POINTER(I), C.POINTER(I)])(display, C.byref(major), C.byref(minor))
    assert api(egl, 'eglBindAPI', U, [U])(0x30A0)
    config, count = P(), I()
    attrs = (I * 9)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3022, 8, 0x3038)
    assert api(egl, 'eglChooseConfig', U, [P, C.POINTER(I), C.POINTER(P), I, C.POINTER(I)])(display, attrs, C.byref(config), 1, C.byref(count)) and count.value
    surface = api(egl, 'eglCreatePbufferSurface', P, [P, P, C.POINTER(I)])(display, config, (I * 5)(0x3057, 1, 0x3056, 1, 0x3038))
    context = api(egl, 'eglCreateContext', P, [P, P, P, C.POINTER(I)])(display, config, None, (I * 3)(0x3098, 3, 0x3038))
    assert surface and context
    assert api(egl, 'eglMakeCurrent', U, [P, P, P, P])(display, surface, surface, context)
except (OSError, AttributeError, AssertionError) as error:
    print('SKIP: native EGL/GLES compiler unavailable (' + str(error) + ').')
    sys.exit(77)

create_shader = api(gl, 'glCreateShader', U, [U])
shader_source = api(gl, 'glShaderSource', None, [U, I, C.POINTER(C.c_char_p), C.POINTER(I)])
compile_shader = api(gl, 'glCompileShader', None, [U])
shader_iv = api(gl, 'glGetShaderiv', None, [U, U, C.POINTER(I)])
shader_log = api(gl, 'glGetShaderInfoLog', None, [U, I, C.POINTER(I), C.c_char_p])
delete_shader = api(gl, 'glDeleteShader', None, [U])
create_program = api(gl, 'glCreateProgram', U, [])
attach_shader = api(gl, 'glAttachShader', None, [U, U])
link_program = api(gl, 'glLinkProgram', None, [U])
program_iv = api(gl, 'glGetProgramiv', None, [U, U, C.POINTER(I)])
program_log = api(gl, 'glGetProgramInfoLog', None, [U, I, C.POINTER(I), C.c_char_p])
delete_program = api(gl, 'glDeleteProgram', None, [U])


def shader(kind, source):
    handle = create_shader(kind)
    text = C.c_char_p(source.encode())
    shader_source(handle, 1, C.byref(text), None)
    compile_shader(handle)
    ok = I()
    shader_iv(handle, 0x8B81, C.byref(ok))
    if not ok.value:
        log = C.create_string_buffer(65536)
        shader_log(handle, len(log), None, log)
        delete_shader(handle)
        raise RuntimeError(log.value.decode())
    return handle


version = api(gl, 'glGetString', C.c_char_p, [U])(0x1F02).decode()
print('Native compiler:', version, flush=True)
try:
    for case in cases:
        handles, program = [], 0
        try:
            handles.append(shader(0x8B31, case['vertex']))
            handles.append(shader(0x8B30, case['fragment']))
            program = create_program()
            for handle in handles:
                attach_shader(program, handle)
            link_program(program)
            ok = I()
            program_iv(program, 0x8B82, C.byref(ok))
            if not ok.value:
                log = C.create_string_buffer(65536)
                program_log(program, len(log), None, log)
                raise RuntimeError(log.value.decode())
        except RuntimeError as error:
            print('FAIL:', case['name'], '\n' + str(error), file=sys.stderr)
            sys.exit(1)
        finally:
            if program:
                delete_program(program)
            for handle in handles:
                delete_shader(handle)
    print('PASS:', len(cases), 'unique GLSL ES 1.00 / 3.00 programs compiled and linked.')
finally:
    api(egl, 'eglMakeCurrent', U, [P, P, P, P])(display, None, None, None)
    api(egl, 'eglDestroyContext', U, [P, P])(display, context)
    api(egl, 'eglDestroySurface', U, [P, P])(display, surface)
    api(egl, 'eglTerminate', U, [P])(display)
