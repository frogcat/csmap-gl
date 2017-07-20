(function() {

  var getString = function(fn) {
    var s = fn.toString();
    return s.substr(0, s.lastIndexOf("*/")).substr(s.indexOf("/*") + 2);
  };

  var vertexShaderSource = getString((function() {
    /*
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform vec2 u_resolution;
varying vec2 v_texCoord;
void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clipSpace = zeroToTwo - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0, 1);
  v_texCoord = a_texCoord;
}
*/
  }));
  var fragmentShaderSource = getString((function() {
    /*
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_textureSize;
uniform float u_meterPerPixel;
uniform float u_curvature;
uniform float u_slope;
varying vec2 v_texCoord;

float altitude(vec4 rgba) {
//  return (((rgba.r * 256.0) + rgba.g ) * 256.0 + rgba.b ) * 256.0 * 0.01;
  return -10000.0  + (((rgba.r * 256.0) + rgba.g ) * 256.0 + rgba.b ) * 256.0 * 0.1;
}

void main() {
  vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;

  vec4 m0 = texture2D(u_image, v_texCoord + onePixel * vec2( -1, -1));
  vec4 m1 = texture2D(u_image, v_texCoord + onePixel * vec2(  0, -1));
  vec4 m2 = texture2D(u_image, v_texCoord + onePixel * vec2(  1, -1));
  vec4 m3 = texture2D(u_image, v_texCoord + onePixel * vec2( -1,  0));
  vec4 m4 = texture2D(u_image, v_texCoord + onePixel * vec2(  0,  0));
  vec4 m5 = texture2D(u_image, v_texCoord + onePixel * vec2(  1,  0));
  vec4 m6 = texture2D(u_image, v_texCoord + onePixel * vec2( -1,  1));
  vec4 m7 = texture2D(u_image, v_texCoord + onePixel * vec2(  0,  1));
  vec4 m8 = texture2D(u_image, v_texCoord + onePixel * vec2(  1,  1));

  float h0 = altitude(m0) / u_meterPerPixel;
  float h1 = altitude(m1) / u_meterPerPixel;
  float h2 = altitude(m2) / u_meterPerPixel;
  float h3 = altitude(m3) / u_meterPerPixel;
  float h4 = altitude(m4) / u_meterPerPixel;
  float h5 = altitude(m5) / u_meterPerPixel;
  float h6 = altitude(m6) / u_meterPerPixel;
  float h7 = altitude(m7) / u_meterPerPixel;
  float h8 = altitude(m8) / u_meterPerPixel;

  float sx = (h2 + h5 + h5 + h8) - (h0 + h3 + h3 + h6);
  float sy = (h6 + h7 + h7 + h8) - (h0 + h1 + h1 + h2);
  float s = clamp(sqrt(sx * sx + sy * sy) * u_slope,0.0,1.0);
  float c = clamp(((h4 - h1) + (h4 - h3) + (h4 - h5) + (h4 - h7)) * u_curvature,-1.0,1.0);

  gl_FragColor =
      c > 0.0 ?
        vec4(1.0 * c,0.5 * c,0.0,s)
        : vec4(0.0,0.0,c * -0.5,s);

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
    var positionLocation = gl.getAttribLocation(program, "a_position");
    var texcoordLocation = gl.getAttribLocation(program, "a_texCoord");
    var resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    var textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");
    var meterPerPixelLocation = gl.getUniformLocation(program, "u_meterPerPixel");
    var curvatureLocation = gl.getUniformLocation(program, "u_curvature");
    var slopeLocation = gl.getUniformLocation(program, "u_slope");

    // Create a buffer to put three 2d clip space points in
    var positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, w, 0, 0, h, w, h]), gl.STATIC_DRAW);

    // provide texture coordinates for the rectangle.
    var texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    // Create a texture.
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.viewport(0, 0, w, h);
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(texcoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionLocation, w, h);
    gl.uniform2f(textureSizeLocation, w, h);
    gl.uniform1f(meterPerPixelLocation, 10 * Math.pow(2, 14 - zoom));
    gl.uniform1f(curvatureLocation, curvature);
    gl.uniform1f(slopeLocation, slope);

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
