"""Composite the live SVG labels onto a native thumbnail. Build-time only."""
import ctypes as C
from ctypes.util import find_library
import numpy as np
from PIL import Image

def composite(image, markup, logical_size):
    cairo=C.CDLL(find_library('cairo'))
    svg=C.CDLL(find_library('rsvg-2'))
    obj=C.CDLL(find_library('gobject-2.0'))
    def function(lib,name,restype,*argtypes):
        f=getattr(lib,name); f.restype=restype; f.argtypes=argtypes;return f
    p,i=C.c_void_p,C.c_int
    # Cairo's native ARGB32 is premultiplied. Render the vector overlay directly
    # on the opaque scene in native channel order to avoid an alpha round trip.
    bg=np.asarray(image.convert('RGBA'),dtype=np.uint8)
    pixels=np.ascontiguousarray(bg[:,:,[2,1,0,3]] if np.little_endian else bg[:,:,[3,0,1,2]])
    w,h=image.size
    surf=function(cairo,'cairo_image_surface_create_for_data',p,p,i,i,i,i)(pixels.ctypes.data,0,w,h,4*w)
    ctx=function(cairo,'cairo_create',p,p)(surf)
    function(cairo,'cairo_scale',None,p,C.c_double,C.c_double)(ctx,w/logical_size[0],h/logical_size[1])
    raw=markup.encode('utf8')
    handle=function(svg,'rsvg_handle_new_from_data',p,C.c_char_p,C.c_size_t,p)(raw,len(raw),None)
    try:
        if not handle:raise ValueError('Invalid thumbnail SVG')
        if not function(svg,'rsvg_handle_render_cairo',i,p,p)(handle,ctx):raise ValueError('Cannot render thumbnail labels')
        function(cairo,'cairo_surface_flush',None,p)(surf)
        rgb=pixels[:,:,[2,1,0]] if np.little_endian else pixels[:,:,1:4]
        return Image.fromarray(rgb,'RGB')
    finally:
        if handle:function(obj,'g_object_unref',None,p)(handle)
        function(cairo,'cairo_destroy',None,p)(ctx)
        function(cairo,'cairo_surface_destroy',None,p)(surf)
