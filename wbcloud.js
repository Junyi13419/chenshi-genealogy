/*
 * WorkBuddyCloud 兼容层 —— 基于 Supabase REST API
 * 保持与族谱旧版 wbcloud.js 完全一致的调用接口：
 *   WorkBuddyCloud.createWorkBuddyCloud({endpoint, publishableKey})
 *     .database.from("clan_data").select("members,users").eq("doc_key","main").maybeSingle()
 *     .database.from("clan_data").upsert({...})
 * 这样四个页面（index/main/mobile/lineage）无需任何修改。
 * anon key 是 Supabase 设计为可公开的客户端密钥，数据访问由 RLS 策略约束。
 */
(function (global) {
  "use strict";

  var SUPA_URL = "https://lqnojcmjrffwyvwpzodr.supabase.co";
  var SUPA_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxbm9qY21qcmZmd3l2d3B6b2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk3NjksImV4cCI6MjExMDQxNTc2OX0.DXTukSC9F2vXKqQpYW4W1lXLewJoliJaxJODpgrSc74";

  function headers(extra) {
    var h = {
      "apikey": SUPA_ANON_KEY,
      "Authorization": "Bearer " + SUPA_ANON_KEY,
      "Content-Type": "application/json"
    };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) h[k] = extra[k]; } }
    return h;
  }

  function parseError(status, text) {
    var msg = text || ("HTTP " + status);
    try {
      var j = JSON.parse(text);
      msg = j.message || j.error_description || j.hint || j.error || msg;
    } catch (e) {}
    return { message: String(msg), status: status };
  }

  // 查询构造器：select().eq().maybeSingle()
  function QueryBuilder(table) {
    this._table = table;
    this._select = "*";
    this._eq = [];
    this._limit = null;
  }
  QueryBuilder.prototype.select = function (cols) {
    this._select = cols || "*";
    return this;
  };
  QueryBuilder.prototype.eq = function (col, val) {
    this._eq.push(col + "=eq." + encodeURIComponent(val));
    return this;
  };
  QueryBuilder.prototype.limit = function (n) {
    this._limit = n;
    return this;
  };
  QueryBuilder.prototype._url = function () {
    var q = "select=" + encodeURIComponent(this._select);
    for (var i = 0; i < this._eq.length; i++) { q += "&" + this._eq[i]; }
    if (this._limit != null) { q += "&limit=" + this._limit; }
    return SUPA_URL + "/rest/v1/" + this._table + "?" + q;
  };
  QueryBuilder.prototype.then = function (onOk, onErr) {
    return this.execute().then(onOk, onErr);
  };
  QueryBuilder.prototype.catch = function (onErr) {
    return this.execute().catch(onErr);
  };
  QueryBuilder.prototype.execute = function () {
    return fetch(this._url(), { method: "GET", headers: headers() }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) { return { data: null, error: parseError(r.status, t) }; });
      }
      return r.json().then(function (rows) { return { data: rows, error: null }; });
    }).catch(function (e) {
      return { data: null, error: { message: String(e && e.message || e) } };
    });
  };
  // maybeSingle: 取第一条，没有则 data=null（对齐旧 SDK 语义）
  QueryBuilder.prototype.maybeSingle = function () {
    this._limit = 1;
    var self = this;
    return self.execute().then(function (res) {
      if (res.error) return res;
      var rows = Array.isArray(res.data) ? res.data : [];
      return { data: rows.length ? rows[0] : null, error: null };
    });
  };
  // single: 语义同 maybeSingle（旧代码未使用，保留兼容）
  QueryBuilder.prototype.single = QueryBuilder.prototype.maybeSingle;

  function upsertOn(table, row) {
    var payload = Array.isArray(row) ? row : [row];
    var h = headers({ "Prefer": "resolution=merge-duplicates,return=representation" });
    return fetch(SUPA_URL + "/rest/v1/" + table, {
      method: "POST",
      headers: h,
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) { return { data: null, error: parseError(r.status, t) }; });
      }
      return r.json().then(function (d) { return { data: d, error: null }; })
        .catch(function () { return { data: [], error: null }; });
    }).catch(function (e) {
      return { data: null, error: { message: String(e && e.message || e) } };
    });
  }

  var client = {
    database: {
      from: function (table) {
        var qb = new QueryBuilder(table);
        // 让 .upsert({...}) 直接可用（与旧 SDK 一致）
        qb.upsert = function (row) { return upsertOn(table, row); };
        return qb;
      }
    }
  };

  global.WorkBuddyCloud = {
    createWorkBuddyCloud: function (config) {
      // config 中的 endpoint/publishableKey 保留兼容但忽略
      return client;
    },
    __SUPA_URL: SUPA_URL
  };
})(typeof window !== "undefined" ? window : this);
