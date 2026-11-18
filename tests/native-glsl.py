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
import time

os.environ.setdefault('EGL_PLATFORM', 'surfaceless')
P, I, U = C.c_void_p, C.c_int, C.c_uint
cases = json.load(sys.stdin)
snapshot_width = max([8] + [int(c.get('snapshot', {}).get('width', 8)) for c in cases])
snapshot_height = max([8] + [int(c.get('snapshot', {}).get('height', 8)) for c in cases])


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
    surface = api(egl, 'eglCreatePbufferSurface', P, [P, P, C.POINTER(I)])(display, config, (I * 5)(0x3057, snapshot_width, 0x3056, snapshot_height, 0x3038))
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


def first_frame(program, values, snapshot=None):
    """Optional real 8x8 draw: linking alone misses deferred driver compilation.

    Only this offline diagnostic uses a synchronous readback; app rendering
    continues to use nonblocking completion fences. No extra packages needed.
    """
    F = C.c_float
    location = api(gl, 'glGetUniformLocation', I, [U, C.c_char_p])
    api(gl, 'glUseProgram', None, [U])(program)
    for item in values:
        at = location(program, item['name'].encode())
        if at < 0:
            continue
        method, args = item['method'], item['args']
        function = 'gl' + method[0].upper() + method[1:]
        if 'Matrix' in method:
            n, data = int(method[13]), args[-1]
            api(gl, function, None, [I, I, U, C.POINTER(F)])(at, len(data)//(n*n), False, (F * len(data))(*data))
        elif method.endswith('fv'):
            n, data = int(method[7]), args[0]
            api(gl, function, None, [I, I, C.POINTER(F)])(at, len(data)//n, (F * len(data))(*data))
        else:
            kind = I if method.endswith('i') else F
            api(gl, function, None, [I] + [kind] * len(args))(at, *args)
    width, height = (int(snapshot['width']), int(snapshot['height'])) if snapshot else (8, 8)
    api(gl, 'glUniform2f', None, [I, F, F])(location(program, b'uResolution'), width, height)
    buffer = U()
    api(gl, 'glGenBuffers', None, [I, C.POINTER(U)])(1, C.byref(buffer))
    try:
        api(gl, 'glBindBuffer', None, [U, U])(0x8892, buffer)
        vertices = (F * 6)(-1, -1, 3, -1, -1, 3)
        api(gl, 'glBufferData', None, [U, C.c_ssize_t, P, U])(0x8892, C.sizeof(vertices), vertices, 0x88E4)
        attribute = api(gl, 'glGetAttribLocation', I, [U, C.c_char_p])(program, b'aPosition')
        api(gl, 'glEnableVertexAttribArray', None, [U])(attribute)
        api(gl, 'glVertexAttribPointer', None, [U, I, U, U, I, P])(attribute, 2, 0x1406, False, 0, None)
        api(gl, 'glViewport', None, [I, I, I, I])(0, 0, width, height)
        api(gl, 'glDrawArrays', None, [U, I, I])(4, 0, 3)
        pixels = (C.c_ubyte * (width * height * 4))()
        api(gl, 'glReadPixels', None, [I, I, I, I, U, U, P])(0, 0, width, height, 0x1908, 0x1401, pixels)
        error = api(gl, 'glGetError', U, [])()
        if error:
            raise RuntimeError('First draw returned GL error ' + hex(error))
        if snapshot:
            # Standard-library PNG diagnostic, not a browser screenshot.
            import struct
            import zlib
            def chunk(kind, data):
                return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
            rows = b''.join(b'\x00' + bytes(pixels[y*width*4:(y+1)*width*4]) for y in range(height-1, -1, -1))
            with open(snapshot['path'], 'wb') as image:
                image.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
            print('SNAPSHOT:', snapshot['path'], flush=True)
    finally:
        api(gl, 'glDeleteBuffers', None, [I, C.POINTER(U)])(1, C.byref(buffer))


try:
    for case in cases:
        handles, program = [], 0
        started = time.perf_counter()
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
            if 'firstFrameUniforms' in case:
                linked = time.perf_counter()
                first_frame(program, case['firstFrameUniforms'], case.get('snapshot'))
                print('FIRST FRAME:', case['name'], 'link %.3fs, complete %.3fs' % (linked-started, time.perf_counter()-started), flush=True)
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
