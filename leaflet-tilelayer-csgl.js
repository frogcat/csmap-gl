(function() {

  var getString = function(fn) {
    var s = fn.toString();
    return s.substr(0, s.lastIndexOf("*/")).substr(s.indexOf("/*") + 2);
  };

  var vertexShaderSource = getString((function() {
    /*
attribute vec2 clip;
varying vec2 center;
void main() {
  gl_Position = vec4(clip,0.0,1.0);
  center = vec2(clip.x + 1.0, 1.0 - clip.y) * 0.5;
}
*/
  }));
  var fragmentShaderSource = getString((function() {
    /*
precision mediump float;
uniform sampler2D image;
uniform vec2 size;
uniform vec2 amp;
varying vec2 center;
const vec4 rgb2alt = vec4(256 * 256, 256 , 1, 0) * 256.0 * 0.01;
const mat3 conv_c = mat3(vec3(0,-1, 0),vec3(-1, 4,-1), vec3(0,-1, 0));
const mat3 conv_sx = mat3(vec3(-1, 0, 1),vec3(-2, 0, 2),vec3(-1, 0, 1));
const mat3 conv_sy = mat3(vec3(-1,-2,-1),vec3(0, 0, 0),vec3( 1, 2, 1));

float conv(mat3 a, mat3 b){
  return dot(a[0],b[0]) + dot(a[1],b[1]) + dot(a[2],b[2]);
}

void main() {
  mat3 h = mat3(
    vec3(dot(texture2D(image, center + vec2(-1,-1) / size), rgb2alt),
         dot(texture2D(image, center + vec2( 0,-1) / size), rgb2alt),
         dot(texture2D(image, center + vec2( 1,-1) / size), rgb2alt)),
    vec3(dot(texture2D(image, center + vec2(-1, 0) / size), rgb2alt),
         dot(texture2D(image, center + vec2( 0, 0) / size), rgb2alt),
         dot(texture2D(image, center + vec2( 1, 0) / size), rgb2alt)),
    vec3(dot(texture2D(image, center + vec2(-1, 1) / size), rgb2alt),
         dot(texture2D(image, center + vec2( 0, 1) / size), rgb2alt),
         dot(texture2D(image, center + vec2( 1, 1) / size), rgb2alt))
  );

  vec2 cs = vec2(
    conv(h,conv_c),
    length(vec2(conv(h , conv_sx),conv(h , conv_sy)))
  ) * amp;
  gl_FragColor =
    h[1][1] > 4000.0 ? vec4(0) :
     cs[0] > 0.0 ?
        vec4(1.0 * cs[0], 0.5 * cs[0],0.0,cs[1])
        : vec4(0.0,0.0,cs[0] * -0.5,cs[1]);
}
*/
  }));

  var initProgram = function(gl) {
    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vertexShaderSource);
    gl.compileShader(vs);
    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragmentShaderSource);
    gl.compileShader(fs);
    var pg = gl.createProgram();
    gl.attachShader(pg, vs);
    gl.attachShader(pg, fs);
    gl.linkProgram(pg);
    if (gl.getProgramParameter(pg, gl.LINK_STATUS)) {
      gl.useProgram(pg);
      return pg;
    } else {
      console.log(gl.getProgramInfoLog(pg));
      return null;
    }
  };

  var render = function(gl, program, image, zoom, curvature, slope) {

    var w = image.width;
    var h = image.height;
    var clipLocation = gl.getAttribLocation(program, "clip");
    var sizeLocation = gl.getUniformLocation(program, "size");
    var ampLocation = gl.getUniformLocation(program, "amp");

    // provide texture coordinates for the rectangle.
    var clipBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, clipBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // Create a texture.
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.viewport(0, 0, w, h);

    gl.enableVertexAttribArray(clipLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, clipBuffer);
    gl.vertexAttribPointer(clipLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(sizeLocation, w, h);
    var z = 10 * Math.pow(2, 14 - zoom);
    gl.uniform2f(ampLocation, curvature / z, slope / z);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };


  L.TileLayer.CSGL = L.TileLayer.extend({
    options: {
      curvature: 2.0,
      slope: 0.15
    },
    _initContainer: function() {
      L.TileLayer.prototype._initContainer.call(this);

      var canvas = this._canvas = document.createElement('canvas');
      canvas.style.zIndex = 10000;
      canvas.style.position = "absolute";

      this._gl = canvas.getContext('webgl', null) || canvas.getContext('experimental-webgl');
      this._pg = initProgram(this._gl);
      this._timer = NaN;

      this._map.on("moveend", function() {
        this._paint();
      }, this);

      this.on("tileload", function(event) {
        event.tile.style.display = "none";
      });
      this.on("tileload load loading", function(event) {
        this._paint();
      }, this);
    },

    _paint: function() {

      if (!isNaN(this._timer)) clearTimeout(this._timer);
      var that = this;
      this._timer = setTimeout(function() {
        that._doPaint();
        that._timer = NaN;
      }, 10);
    },

    _doPaint: function() {

      var center = this._map.getCenter();
      var pixelBounds = this._getTiledPixelBounds(center);
      var tileRange = this._pxBoundsToTileRange(pixelBounds);
      var size = tileRange.getSize().add([1, 1]).scaleBy(this.getTileSize());
      var canvas = this._canvas;
      var shadow = document.createElement("canvas");
      canvas.width = shadow.width = size.x;
      canvas.height = shadow.height = size.y;
      canvas.style.width = size.x + "px";
      canvas.style.height = size.y + "px";
      this._level.el.appendChild(canvas);
      var context = shadow.getContext("2d");
      context.fillStyle = "#7f0000";
      context.fillRect(0, 0, size.x, size.y);
      var origin = this._getTilePos(tileRange.min);
      for (var key in this._tiles) {
        var tile = this._tiles[key];
        if (tile.current) {
          var pos = this._getTilePos(tile.coords).subtract(origin);
          try {
            context.drawImage(tile.el, pos.x, pos.y);
          } catch (ex) {}
        }
      }
      L.DomUtil.setPosition(canvas, origin);
      var curvature = this.options.curvature || 2.0;
      var slope = this.options.slope || 0.15;
      render(this._gl, this._pg, shadow, this._map.getZoom(), curvature, slope);
    }
  });

  L.tileLayer.csgl = function(url, options) {
    return new L.TileLayer.CSGL(url, options);
  };

})();
