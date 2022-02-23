(function(s, l) {

  debugger;

  // This create the cookie string, b is the cookie property, e is the value, t is a constant (302E7)
  function m(b, e, c) {
      c = c || new Date(+new Date + t);
      c = "expires=" + c.toUTCString();
      n.cookie = b + "=" + e + ";" + c + ";path=/"
  }

  function p(b) {
      b += "=";
      for (var e = n.cookie.split(";"), c = 0; c < e.length; c++) {
          for (var a = e[c];
              " " == a.charAt(0);) a = a.substring(1);
          if (0 === a.indexOf(b)) return decodeURIComponent(a.substring(b.length, a.length))
      }
      return ""
  }

  // call is later on as: r = a = q(a, "t", +new Date); 
  // where a: a = f || p("csm-hit") || "{}"
  function q(b, e, c) {
      if (!e) return b; - 1 < b.indexOf("{") && (b = "");
      for (var a = b.split("&"), f, d = !1, h = !1, g = 0; g < a.length; g++) f = a[g].split(":"), f[0] == e ? (!c || d ? a.splice(g, 1) : (f[1] = c, a[g] =
          f.join(":")), h = d = !0) : 2 > f.length && (a.splice(g, 1), h = !0);
      h && (b = a.join("&"));
      !d && c && (0 < b.length && (b += "&"), b += e + ":" + c);
      return b
  }

  // s is ue_csm (from input)
  var k = s.ue || {},
      t = 3024E7,
      n = ue_csm.document || l.document,
      r = null,
      d;
  a: {
      try {
          // l is window
          d = l.localStorage;
          break a
      } catch (u) {}
      d = void 0
  }
  k.count && k.count("csm.cookieSize", document.cookie.length);
  k.cookie = {
      get: p,
      set: m,
      updateCsmHit: function(b, e, c) {
          try {
              var a;
              if (!(a = r)) {
                  var f;
                  a: {
                      try {
                          if (d && d.getItem) {
                              f = d.getItem("csm-hit");
                              break a
                          }
                      } catch (k) {}
                      f = void 0
                  }
                  a = f || p("csm-hit") || "{}"
              }
              a = q(a, b, e);
              r = a = q(a, "t", +new Date);
              try {
                  d && d.setItem && d.setItem("csm-hit", a)
              } catch (h) {}
              m("csm-hit", a, c)
          } catch (g) {
              "function" == typeof l.ueLogError && ueLogError(Error("Cookie manager: " + g.message), {
                  logLevel: "WARN"
              })
          }
      }
  }
})(ue_csm, window);


(function(l, d) {
  function c(b) {
      b = "";
      var c = a.isBFT ? "b" : "s",
          d = "" + a.oid,
          f = "" + a.lid,
          g = d;
      d != f && 20 == f.length && (c += "a", g += "-" + f);
      a.tabid && (b = a.tabid + "+");
      b += c + "-" + g;
      b != e && 100 > b.length && (e = b, a.cookie ? a.cookie.updateCsmHit(m, b + ("|" + +new Date)) : document.cookie = "csm-hit=" + b + ("|" + +new Date) + n + "; path=/")
  }

  function p() {
      e = 0
  }

  function h(b) {
      !0 === d[a.pageViz.propHid] ? e = 0 : !1 === d[a.pageViz.propHid] && c({
          type: "visible"
      })
  }
  var n = "; expires=" + (new Date(+new Date + 6048E5)).toGMTString(),
      m = "tb",
      e, a = l.ue || {},
      k = a.pageViz && a.pageViz.event &&
      a.pageViz.propHid;
  a.attach && (a.attach("click", c), a.attach("keyup", c), k || (a.attach("focus", c), a.attach("blur", p)), k && (a.attach(a.pageViz.event, h, d), h({})));
  a.aftb = 1
})(ue_csm, document);