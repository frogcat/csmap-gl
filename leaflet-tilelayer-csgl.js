(function() {

  var vertexShaderSource =
    "attribute vec2 clip;" +
    "void main() {gl_Position = vec4(clip,0,1);}";

  var fragmentShaderSource = `
precision mediump float;
uniform sampler2D image;
uniform vec2 unit;
uniform vec2 norm;
uniform mat3 pallet;
const vec4 rgb2alt = vec4(256 * 256, 256 , 1, 0) * 256.0 * 0.01;
const mat3 conv_c = mat3(vec3(0,-1, 0),vec3(-1, 4,-1), vec3(0,-1, 0));
const mat3 conv_sx = mat3(vec3(-1, 0, 1),vec3(-2, 0, 2),vec3(-1, 0, 1));
const mat3 conv_sy = mat3(vec3(-1,-2,-1),vec3(0, 0, 0),vec3( 1, 2, 1));

float conv(mat3 a, mat3 b){
  return dot(a[0],b[0]) + dot(a[1],b[1]) + dot(a[2],b[2]);
}

float alt(sampler2D i,vec2 p){
  return dot(texture2D(i, p), rgb2alt);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x,1.0 / unit.y - gl_FragCoord.y);
  mat3 h;
  h[0][0] = alt(image, (p + vec2(-1,-1)) * unit);
  h[0][1] = alt(image, (p + vec2( 0,-1)) * unit);
  h[0][2] = alt(image, (p + vec2( 1,-1)) * unit);
  h[1][0] = alt(image, (p + vec2(-1, 0)) * unit);
  h[1][1] = alt(image, (p + vec2( 0, 0)) * unit);
  h[1][2] = alt(image, (p + vec2( 1, 0)) * unit);
  h[2][0] = alt(image, (p + vec2(-1, 1)) * unit);
  h[2][1] = alt(image, (p + vec2( 0, 1)) * unit);
  h[2][2] = alt(image, (p + vec2( 1, 1)) * unit);
  vec2 cs = h[1][1] > 4000.0 ? vec2(0) : clamp(vec2(
    conv(h,conv_c),
    length(vec2(conv(h , conv_sx),conv(h , conv_sy)))
  ) * norm, -1.0,1.0);
  gl_FragColor = vec4(cs[0] > 0.0 ? mix(pallet[1],pallet[2],cs[0]) : mix(pallet[1],pallet[0],-cs[0]) ,cs[1]);

}`;

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

  var render = function(gl, program, image, zoom, curvature, slope, pallet) {

    var w = image.width;
    var h = image.height;
    var clipLocation = gl.getAttribLocation(program, "clip");
    var unitLocation = gl.getUniformLocation(program, "unit");
    var normLocation = gl.getUniformLocation(program, "norm");
    var palletLocation = gl.getUniformLocation(program, "pallet");

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
    gl.uniform2f(unitLocation, 1 / w, 1 / h);
    var z = 10 * Math.pow(2, 14 - zoom);
    gl.uniform2f(normLocation, curvature / z, slope / z);
    gl.uniformMatrix3fv(palletLocation, false, pallet);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };


  L.TileLayer.CSGL = L.TileLayer.extend({
    options: {
      curvature: 2.0,
      slope: 0.15,
      errorTileColor: "#7f0000",
      convexColor: "#f70",
      concaveColor: "#007",
      flatColor: "#000"
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
      context.fillStyle = this.options.errorTileColor;
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
      render(this._gl, this._pg, shadow, this._map.getZoom(), curvature, slope, this._pallet());
    },
    _pallet: function() {
      var a = [];
      [
        this.options.concaveColor,
        this.options.flatColor,
        this.options.convexColor
      ].forEach(function(b) {
        if (b.toLowerCase().match(/^#(..)(..)(..)$/)) {
          a.push(parseInt(RegExp.$1, 16) / 256);
          a.push(parseInt(RegExp.$2, 16) / 256);
          a.push(parseInt(RegExp.$3, 16) / 256);
        } else if (b.toLowerCase().match(/^#(.)(.)(.)$/)) {
          a.push(parseInt(RegExp.$1, 16) / 16);
          a.push(parseInt(RegExp.$2, 16) / 16);
          a.push(parseInt(RegExp.$3, 16) / 16);
        } else {
          a.push(0, 0, 0);
        }
      });
      return new Float32Array(a);
    }
  });

  L.tileLayer.csgl = function(url, options) {
    return new L.TileLayer.CSGL(url, options);
  };

})();
