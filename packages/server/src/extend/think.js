// 移除原有 ip2region 依赖（关键：不再需要本地 IP 库）
// const ip2region = require('dy-node-ip2region');
const helper = require('think-helper');
const parser = require('ua-parser-js');
// 新增：引入 axios 用于调用 API（若用 fetch 可不用）
const axios = require('axios');

const preventMessage = 'PREVENT_NEXT_PROCESS';

// 移除原有本地 IP 库初始化逻辑
// const regionSearch = ip2region.create(process.env.IP2REGION_DB);

const OS_VERSION_MAP = {
  Windows: {
    'NT 11.0': '11',
  },
};

module.exports = {
  prevent() {
    throw new Error(preventMessage);
  },
  isPrevent(err) {
    return think.isError(err) && err.message === preventMessage;
  },
  findLastIndex(arr, fn) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const ret = fn(arr[i], i, arr);

      if (!ret) {
        continue;
      }

      return i;
    }

    return -1;
  },
  promiseAllQueue(promises, taskNum) {
    return new Promise((resolve, reject) => {
      if (!promises.length) {
        return resolve();
      }

      const ret = [];
      let index = 0;
      let count = 0;

      function runTask() {
        const idx = index;

        index += 1;
        if (index > promises.length) {
          return Promise.resolve();
        }

        return promises[idx].then((data) => {
          ret[idx] = data;
          count += 1;
          if (count === promises.length) {
            resolve(ret);
          }

          return runTask();
        }, reject);
      }

      for (let i = 0; i < taskNum; i++) {
        runTask();
      }
    });
  },
  // 核心修改：替换 ip2region 函数为 API 调用逻辑
  async ip2region(ip, { depth = 1 }) {
    // 空 IP/本地 IP 直接返回空（保持原有逻辑兼容）
    if (!ip || ip.includes(':')) return '';

    try {
      // 调用第三方 IP 解析 API（替换为你想使用的接口）
      // 备选：淘宝 IP 接口 http://ip.taobao.com/outGetIpInfo?ip=${ip}&accessKey=alibaba-inc
      const response = await axios.get(`http://ip-api.com/json/${ip}?lang=zh-CN`, {
        timeout: 5000, // 5秒超时，避免阻塞
      });

      const data = response.data;
      if (data.status !== 'success') {
        throw new Error(`IP 解析失败：${data.message}`);
      }

      // 解析结果（对应原有逻辑的 province/city/isp）
      const province = data.regionName || ''; // 省份/地区
      const city = data.city || '';           // 城市
      const isp = data.isp || '';             // 运营商

      // 按 depth 拼接结果（保持和原有函数返回格式一致）
      const address = Array.from(new Set([province, city, isp].filter((v) => v)));
      return address.slice(0, depth).join(' ');
    } catch (err) {
      console.log('IP 解析 API 调用失败：', err);
      // 降级：返回空字符串（和原有逻辑一致）
      return '';
    }
  },
  uaParser(uaText) {
    const ua = parser(uaText);

    if (OS_VERSION_MAP[ua.os.name]?.[ua.os.version]) {
      ua.os.version = OS_VERSION_MAP[ua.os.name][ua.os.version];
    }

    return ua;
  },
  getLevel(val) {
    const levels = this.config('levels');
    const defaultLevel = 0;

    if (!val) {
      return defaultLevel;
    }

    const level = think.findLastIndex(levels, (l) => l <= val);

    return level === -1 ? defaultLevel : level;
  },
  pluginMap(type, callback) {
    const plugins = think.config('plugins');
    const fns = [];

    if (!think.isArray(plugins)) {
      return fns;
    }

    for (const plugin of plugins) {
      if (!plugin?.[type]) {
        continue;
      }

      const res = callback(plugin[type]);

      if (!res) {
        continue;
      }

      fns.push(res);
    }

    return fns;
  },
  getPluginMiddlewares() {
    const middlewares = think.pluginMap('middlewares', (middleware) => {
      if (think.isFunction(middleware)) {
        return middleware;
      }

      if (think.isArray(middleware)) {
        return middleware.filter((m) => think.isFunction(m));
      }
    });

    return middlewares.flat();
  },
  getPluginHook(hookName) {
    return think
      .pluginMap('hooks', (hook) => (think.isFunction(hook[hookName]) ? hook[hookName] : undefined))
      .filter((v) => v);
  },
  buildUrl(path, query = {}) {
    const notEmptyQuery = {};

    for (const key in query) {
      if (!query[key]) {
        continue;
      }
      notEmptyQuery[key] = query[key];
    }

    const notEmptyQueryStr = new URLSearchParams(notEmptyQuery).toString();

    let destUrl = path;

    if (destUrl && notEmptyQueryStr) {
      destUrl += destUrl.indexOf('?') !== -1 ? '&' : '?';
    }
    if (notEmptyQueryStr) {
      destUrl += notEmptyQueryStr;
    }

    return destUrl;
  },
};