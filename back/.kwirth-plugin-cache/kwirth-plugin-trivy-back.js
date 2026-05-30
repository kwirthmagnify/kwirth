var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/@kwirthmagnify/kwirth-common/dist/Channel.js
var require_Channel = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/Channel.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EClusterType = exports2.ClusterTypeEnum = void 0;
    var ClusterTypeEnum;
    (function(ClusterTypeEnum2) {
      ClusterTypeEnum2["KUBERNETES"] = "kubernetes";
      ClusterTypeEnum2["DOCKER"] = "docker";
    })(ClusterTypeEnum || (exports2.ClusterTypeEnum = ClusterTypeEnum = {}));
    var EClusterType2;
    (function(EClusterType3) {
      EClusterType3["KUBERNETES"] = "kubernetes";
      EClusterType3["DOCKER"] = "docker";
    })(EClusterType2 || (exports2.EClusterType = EClusterType2 = {}));
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/Sender.js
var require_Sender = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/Sender.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/InstanceMessage.js
var require_InstanceMessage = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/InstanceMessage.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EInstanceMessageFlow = exports2.InstanceMessageFlowEnum = exports2.EInstanceMessageAction = exports2.InstanceMessageActionEnum = exports2.EInstanceMessageType = exports2.InstanceMessageTypeEnum = exports2.EInstanceMessageChannel = exports2.InstanceMessageChannelEnum = void 0;
    var InstanceMessageChannelEnum;
    (function(InstanceMessageChannelEnum2) {
      InstanceMessageChannelEnum2["NONE"] = "none";
      InstanceMessageChannelEnum2["LOG"] = "log";
      InstanceMessageChannelEnum2["METRICS"] = "metrics";
      InstanceMessageChannelEnum2["AUDIT"] = "audit";
      InstanceMessageChannelEnum2["OPS"] = "ops";
      InstanceMessageChannelEnum2["ALERT"] = "alert";
      InstanceMessageChannelEnum2["TRIVY"] = "trivy";
    })(InstanceMessageChannelEnum || (exports2.InstanceMessageChannelEnum = InstanceMessageChannelEnum = {}));
    var EInstanceMessageChannel2;
    (function(EInstanceMessageChannel3) {
      EInstanceMessageChannel3["NONE"] = "none";
      EInstanceMessageChannel3["LOG"] = "log";
      EInstanceMessageChannel3["METRICS"] = "metrics";
      EInstanceMessageChannel3["AUDIT"] = "audit";
      EInstanceMessageChannel3["OPS"] = "ops";
      EInstanceMessageChannel3["ALERT"] = "alert";
      EInstanceMessageChannel3["TRIVY"] = "trivy";
      EInstanceMessageChannel3["MAGNIFY"] = "magnify";
    })(EInstanceMessageChannel2 || (exports2.EInstanceMessageChannel = EInstanceMessageChannel2 = {}));
    var InstanceMessageTypeEnum;
    (function(InstanceMessageTypeEnum2) {
      InstanceMessageTypeEnum2["DATA"] = "data";
      InstanceMessageTypeEnum2["SIGNAL"] = "signal";
    })(InstanceMessageTypeEnum || (exports2.InstanceMessageTypeEnum = InstanceMessageTypeEnum = {}));
    var EInstanceMessageType2;
    (function(EInstanceMessageType3) {
      EInstanceMessageType3["DATA"] = "data";
      EInstanceMessageType3["SIGNAL"] = "signal";
    })(EInstanceMessageType2 || (exports2.EInstanceMessageType = EInstanceMessageType2 = {}));
    var InstanceMessageActionEnum;
    (function(InstanceMessageActionEnum2) {
      InstanceMessageActionEnum2["NONE"] = "none";
      InstanceMessageActionEnum2["ROUTE"] = "route";
      InstanceMessageActionEnum2["START"] = "start";
      InstanceMessageActionEnum2["STOP"] = "stop";
      InstanceMessageActionEnum2["PAUSE"] = "pause";
      InstanceMessageActionEnum2["CONTINUE"] = "continue";
      InstanceMessageActionEnum2["MODIFY"] = "modify";
      InstanceMessageActionEnum2["PING"] = "ping";
      InstanceMessageActionEnum2["RECONNECT"] = "reconnect";
      InstanceMessageActionEnum2["COMMAND"] = "command";
      InstanceMessageActionEnum2["WEBSOCKET"] = "websocket";
    })(InstanceMessageActionEnum || (exports2.InstanceMessageActionEnum = InstanceMessageActionEnum = {}));
    var EInstanceMessageAction2;
    (function(EInstanceMessageAction3) {
      EInstanceMessageAction3["NONE"] = "none";
      EInstanceMessageAction3["RI"] = "ri";
      EInstanceMessageAction3["ROUTE"] = "route";
      EInstanceMessageAction3["START"] = "start";
      EInstanceMessageAction3["STOP"] = "stop";
      EInstanceMessageAction3["PAUSE"] = "pause";
      EInstanceMessageAction3["CONTINUE"] = "continue";
      EInstanceMessageAction3["MODIFY"] = "modify";
      EInstanceMessageAction3["PING"] = "ping";
      EInstanceMessageAction3["RECONNECT"] = "reconnect";
      EInstanceMessageAction3["COMMAND"] = "command";
      EInstanceMessageAction3["WEBSOCKET"] = "websocket";
    })(EInstanceMessageAction2 || (exports2.EInstanceMessageAction = EInstanceMessageAction2 = {}));
    var InstanceMessageFlowEnum;
    (function(InstanceMessageFlowEnum2) {
      InstanceMessageFlowEnum2["IMMEDIATE"] = "immediate";
      InstanceMessageFlowEnum2["REQUEST"] = "request";
      InstanceMessageFlowEnum2["RESPONSE"] = "response";
      InstanceMessageFlowEnum2["UNSOLICITED"] = "unsolicited";
    })(InstanceMessageFlowEnum || (exports2.InstanceMessageFlowEnum = InstanceMessageFlowEnum = {}));
    var EInstanceMessageFlow2;
    (function(EInstanceMessageFlow3) {
      EInstanceMessageFlow3["IMMEDIATE"] = "immediate";
      EInstanceMessageFlow3["REQUEST"] = "request";
      EInstanceMessageFlow3["RESPONSE"] = "response";
      EInstanceMessageFlow3["UNSOLICITED"] = "unsolicited";
    })(EInstanceMessageFlow2 || (exports2.EInstanceMessageFlow = EInstanceMessageFlow2 = {}));
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/InstanceConfig.js
var require_InstanceConfig = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/InstanceConfig.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EInstanceConfigScope = exports2.EInstanceConfigView = exports2.EInstanceConfigObject = exports2.InstanceConfigScopeEnum = exports2.InstanceConfigViewEnum = exports2.InstanceConfigObjectEnum = void 0;
    var InstanceConfigObjectEnum;
    (function(InstanceConfigObjectEnum2) {
      InstanceConfigObjectEnum2["PODS"] = "pods";
      InstanceConfigObjectEnum2["EVENTS"] = "events";
    })(InstanceConfigObjectEnum || (exports2.InstanceConfigObjectEnum = InstanceConfigObjectEnum = {}));
    var InstanceConfigViewEnum;
    (function(InstanceConfigViewEnum2) {
      InstanceConfigViewEnum2["NONE"] = "none";
      InstanceConfigViewEnum2["CLUSTER"] = "cluster";
      InstanceConfigViewEnum2["NAMESPACE"] = "namespace";
      InstanceConfigViewEnum2["GROUP"] = "group";
      InstanceConfigViewEnum2["POD"] = "pod";
      InstanceConfigViewEnum2["CONTAINER"] = "container";
    })(InstanceConfigViewEnum || (exports2.InstanceConfigViewEnum = InstanceConfigViewEnum = {}));
    var InstanceConfigScopeEnum;
    (function(InstanceConfigScopeEnum2) {
      InstanceConfigScopeEnum2["NONE"] = "none";
      InstanceConfigScopeEnum2["API"] = "api";
      InstanceConfigScopeEnum2["CLUSTER"] = "cluster";
      InstanceConfigScopeEnum2["FILTER"] = "filter";
      InstanceConfigScopeEnum2["VIEW"] = "view";
      InstanceConfigScopeEnum2["SNAPSHOT"] = "snapshot";
      InstanceConfigScopeEnum2["STREAM"] = "stream";
      InstanceConfigScopeEnum2["CREATE"] = "create";
      InstanceConfigScopeEnum2["SUBSCRIBE"] = "subscribe";
      InstanceConfigScopeEnum2["GET"] = "get";
      InstanceConfigScopeEnum2["EXECUTE"] = "execute";
      InstanceConfigScopeEnum2["RESTART"] = "restart";
      InstanceConfigScopeEnum2["WORKLOAD"] = "workload";
      InstanceConfigScopeEnum2["KUBERNETES"] = "kubernetes";
    })(InstanceConfigScopeEnum || (exports2.InstanceConfigScopeEnum = InstanceConfigScopeEnum = {}));
    var EInstanceConfigObject;
    (function(EInstanceConfigObject2) {
      EInstanceConfigObject2["PODS"] = "pods";
      EInstanceConfigObject2["EVENTS"] = "events";
    })(EInstanceConfigObject || (exports2.EInstanceConfigObject = EInstanceConfigObject = {}));
    var EInstanceConfigView;
    (function(EInstanceConfigView2) {
      EInstanceConfigView2["NONE"] = "none";
      EInstanceConfigView2["CLUSTER"] = "cluster";
      EInstanceConfigView2["NAMESPACE"] = "namespace";
      EInstanceConfigView2["GROUP"] = "group";
      EInstanceConfigView2["POD"] = "pod";
      EInstanceConfigView2["CONTAINER"] = "container";
    })(EInstanceConfigView || (exports2.EInstanceConfigView = EInstanceConfigView = {}));
    var EInstanceConfigScope;
    (function(EInstanceConfigScope2) {
      EInstanceConfigScope2["NONE"] = "none";
      EInstanceConfigScope2["API"] = "api";
      EInstanceConfigScope2["CLUSTER"] = "cluster";
      EInstanceConfigScope2["FILTER"] = "filter";
      EInstanceConfigScope2["VIEW"] = "view";
      EInstanceConfigScope2["SNAPSHOT"] = "snapshot";
      EInstanceConfigScope2["STREAM"] = "stream";
      EInstanceConfigScope2["CREATE"] = "create";
      EInstanceConfigScope2["SUBSCRIBE"] = "subscribe";
      EInstanceConfigScope2["GET"] = "get";
      EInstanceConfigScope2["EXECUTE"] = "execute";
      EInstanceConfigScope2["RESTART"] = "restart";
      EInstanceConfigScope2["WORKLOAD"] = "workload";
      EInstanceConfigScope2["KUBERNETES"] = "kubernetes";
    })(EInstanceConfigScope || (exports2.EInstanceConfigScope = EInstanceConfigScope = {}));
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/RouteMessage.js
var require_RouteMessage = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/RouteMessage.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/SignalMessage.js
var require_SignalMessage = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/SignalMessage.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ESignalMessageEvent = exports2.ESignalMessageLevel = exports2.SignalMessageEventEnum = exports2.SignalMessageLevelEnum = void 0;
    var SignalMessageLevelEnum;
    (function(SignalMessageLevelEnum2) {
      SignalMessageLevelEnum2["INFO"] = "info";
      SignalMessageLevelEnum2["WARNING"] = "warning";
      SignalMessageLevelEnum2["ERROR"] = "error";
    })(SignalMessageLevelEnum || (exports2.SignalMessageLevelEnum = SignalMessageLevelEnum = {}));
    var SignalMessageEventEnum;
    (function(SignalMessageEventEnum2) {
      SignalMessageEventEnum2["ADD"] = "add";
      SignalMessageEventEnum2["DELETE"] = "delete";
      SignalMessageEventEnum2["OTHER"] = "other";
    })(SignalMessageEventEnum || (exports2.SignalMessageEventEnum = SignalMessageEventEnum = {}));
    var ESignalMessageLevel2;
    (function(ESignalMessageLevel3) {
      ESignalMessageLevel3["INFO"] = "info";
      ESignalMessageLevel3["WARNING"] = "warning";
      ESignalMessageLevel3["ERROR"] = "error";
    })(ESignalMessageLevel2 || (exports2.ESignalMessageLevel = ESignalMessageLevel2 = {}));
    var ESignalMessageEvent;
    (function(ESignalMessageEvent2) {
      ESignalMessageEvent2["ADD"] = "add";
      ESignalMessageEvent2["DELETE"] = "delete";
      ESignalMessageEvent2["OTHER"] = "other";
    })(ESignalMessageEvent || (exports2.ESignalMessageEvent = ESignalMessageEvent = {}));
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/ApiKey.js
var require_ApiKey = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/ApiKey.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// node_modules/uuid/dist/cjs/max.js
var require_max = __commonJS({
  "node_modules/uuid/dist/cjs/max.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  }
});

// node_modules/uuid/dist/cjs/nil.js
var require_nil = __commonJS({
  "node_modules/uuid/dist/cjs/nil.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = "00000000-0000-0000-0000-000000000000";
  }
});

// node_modules/uuid/dist/cjs/regex.js
var require_regex = __commonJS({
  "node_modules/uuid/dist/cjs/regex.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;
  }
});

// node_modules/uuid/dist/cjs/validate.js
var require_validate = __commonJS({
  "node_modules/uuid/dist/cjs/validate.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var regex_js_1 = require_regex();
    function validate(uuid) {
      return typeof uuid === "string" && regex_js_1.default.test(uuid);
    }
    exports2.default = validate;
  }
});

// node_modules/uuid/dist/cjs/parse.js
var require_parse = __commonJS({
  "node_modules/uuid/dist/cjs/parse.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var validate_js_1 = require_validate();
    function parse(uuid) {
      if (!(0, validate_js_1.default)(uuid)) {
        throw TypeError("Invalid UUID");
      }
      let v;
      return Uint8Array.of((v = parseInt(uuid.slice(0, 8), 16)) >>> 24, v >>> 16 & 255, v >>> 8 & 255, v & 255, (v = parseInt(uuid.slice(9, 13), 16)) >>> 8, v & 255, (v = parseInt(uuid.slice(14, 18), 16)) >>> 8, v & 255, (v = parseInt(uuid.slice(19, 23), 16)) >>> 8, v & 255, (v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776 & 255, v / 4294967296 & 255, v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
    }
    exports2.default = parse;
  }
});

// node_modules/uuid/dist/cjs/stringify.js
var require_stringify = __commonJS({
  "node_modules/uuid/dist/cjs/stringify.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.unsafeStringify = void 0;
    var validate_js_1 = require_validate();
    var byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).slice(1));
    }
    function unsafeStringify(arr, offset = 0) {
      return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
    }
    exports2.unsafeStringify = unsafeStringify;
    function stringify(arr, offset = 0) {
      const uuid = unsafeStringify(arr, offset);
      if (!(0, validate_js_1.default)(uuid)) {
        throw TypeError("Stringified UUID is invalid");
      }
      return uuid;
    }
    exports2.default = stringify;
  }
});

// node_modules/uuid/dist/cjs/rng.js
var require_rng = __commonJS({
  "node_modules/uuid/dist/cjs/rng.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var crypto_1 = require("crypto");
    var rnds8Pool = new Uint8Array(256);
    var poolPtr = rnds8Pool.length;
    function rng() {
      if (poolPtr > rnds8Pool.length - 16) {
        (0, crypto_1.randomFillSync)(rnds8Pool);
        poolPtr = 0;
      }
      return rnds8Pool.slice(poolPtr, poolPtr += 16);
    }
    exports2.default = rng;
  }
});

// node_modules/uuid/dist/cjs/v1.js
var require_v1 = __commonJS({
  "node_modules/uuid/dist/cjs/v1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.updateV1State = void 0;
    var rng_js_1 = require_rng();
    var stringify_js_1 = require_stringify();
    var _state = {};
    function v1(options, buf, offset) {
      let bytes;
      const isV6 = options?._v6 ?? false;
      if (options) {
        const optionsKeys = Object.keys(options);
        if (optionsKeys.length === 1 && optionsKeys[0] === "_v6") {
          options = void 0;
        }
      }
      if (options) {
        bytes = v1Bytes(options.random ?? options.rng?.() ?? (0, rng_js_1.default)(), options.msecs, options.nsecs, options.clockseq, options.node, buf, offset);
      } else {
        const now = Date.now();
        const rnds = (0, rng_js_1.default)();
        updateV1State(_state, now, rnds);
        bytes = v1Bytes(rnds, _state.msecs, _state.nsecs, isV6 ? void 0 : _state.clockseq, isV6 ? void 0 : _state.node, buf, offset);
      }
      return buf ?? (0, stringify_js_1.unsafeStringify)(bytes);
    }
    function updateV1State(state, now, rnds) {
      state.msecs ??= -Infinity;
      state.nsecs ??= 0;
      if (now === state.msecs) {
        state.nsecs++;
        if (state.nsecs >= 1e4) {
          state.node = void 0;
          state.nsecs = 0;
        }
      } else if (now > state.msecs) {
        state.nsecs = 0;
      } else if (now < state.msecs) {
        state.node = void 0;
      }
      if (!state.node) {
        state.node = rnds.slice(10, 16);
        state.node[0] |= 1;
        state.clockseq = (rnds[8] << 8 | rnds[9]) & 16383;
      }
      state.msecs = now;
      return state;
    }
    exports2.updateV1State = updateV1State;
    function v1Bytes(rnds, msecs, nsecs, clockseq, node, buf, offset = 0) {
      if (rnds.length < 16) {
        throw new Error("Random bytes length must be >= 16");
      }
      if (!buf) {
        buf = new Uint8Array(16);
        offset = 0;
      } else {
        if (offset < 0 || offset + 16 > buf.length) {
          throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
      }
      msecs ??= Date.now();
      nsecs ??= 0;
      clockseq ??= (rnds[8] << 8 | rnds[9]) & 16383;
      node ??= rnds.slice(10, 16);
      msecs += 122192928e5;
      const tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
      buf[offset++] = tl >>> 24 & 255;
      buf[offset++] = tl >>> 16 & 255;
      buf[offset++] = tl >>> 8 & 255;
      buf[offset++] = tl & 255;
      const tmh = msecs / 4294967296 * 1e4 & 268435455;
      buf[offset++] = tmh >>> 8 & 255;
      buf[offset++] = tmh & 255;
      buf[offset++] = tmh >>> 24 & 15 | 16;
      buf[offset++] = tmh >>> 16 & 255;
      buf[offset++] = clockseq >>> 8 | 128;
      buf[offset++] = clockseq & 255;
      for (let n = 0; n < 6; ++n) {
        buf[offset++] = node[n];
      }
      return buf;
    }
    exports2.default = v1;
  }
});

// node_modules/uuid/dist/cjs/v1ToV6.js
var require_v1ToV6 = __commonJS({
  "node_modules/uuid/dist/cjs/v1ToV6.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var parse_js_1 = require_parse();
    var stringify_js_1 = require_stringify();
    function v1ToV6(uuid) {
      const v1Bytes = typeof uuid === "string" ? (0, parse_js_1.default)(uuid) : uuid;
      const v6Bytes = _v1ToV6(v1Bytes);
      return typeof uuid === "string" ? (0, stringify_js_1.unsafeStringify)(v6Bytes) : v6Bytes;
    }
    exports2.default = v1ToV6;
    function _v1ToV6(v1Bytes) {
      return Uint8Array.of((v1Bytes[6] & 15) << 4 | v1Bytes[7] >> 4 & 15, (v1Bytes[7] & 15) << 4 | (v1Bytes[4] & 240) >> 4, (v1Bytes[4] & 15) << 4 | (v1Bytes[5] & 240) >> 4, (v1Bytes[5] & 15) << 4 | (v1Bytes[0] & 240) >> 4, (v1Bytes[0] & 15) << 4 | (v1Bytes[1] & 240) >> 4, (v1Bytes[1] & 15) << 4 | (v1Bytes[2] & 240) >> 4, 96 | v1Bytes[2] & 15, v1Bytes[3], v1Bytes[8], v1Bytes[9], v1Bytes[10], v1Bytes[11], v1Bytes[12], v1Bytes[13], v1Bytes[14], v1Bytes[15]);
    }
  }
});

// node_modules/uuid/dist/cjs/md5.js
var require_md5 = __commonJS({
  "node_modules/uuid/dist/cjs/md5.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var crypto_1 = require("crypto");
    function md5(bytes) {
      if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
      } else if (typeof bytes === "string") {
        bytes = Buffer.from(bytes, "utf8");
      }
      return (0, crypto_1.createHash)("md5").update(bytes).digest();
    }
    exports2.default = md5;
  }
});

// node_modules/uuid/dist/cjs/v35.js
var require_v35 = __commonJS({
  "node_modules/uuid/dist/cjs/v35.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.URL = exports2.DNS = exports2.stringToBytes = void 0;
    var parse_js_1 = require_parse();
    var stringify_js_1 = require_stringify();
    function stringToBytes(str) {
      str = unescape(encodeURIComponent(str));
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; ++i) {
        bytes[i] = str.charCodeAt(i);
      }
      return bytes;
    }
    exports2.stringToBytes = stringToBytes;
    exports2.DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    exports2.URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    function v35(version, hash, value, namespace, buf, offset) {
      const valueBytes = typeof value === "string" ? stringToBytes(value) : value;
      const namespaceBytes = typeof namespace === "string" ? (0, parse_js_1.default)(namespace) : namespace;
      if (typeof namespace === "string") {
        namespace = (0, parse_js_1.default)(namespace);
      }
      if (namespace?.length !== 16) {
        throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
      }
      let bytes = new Uint8Array(16 + valueBytes.length);
      bytes.set(namespaceBytes);
      bytes.set(valueBytes, namespaceBytes.length);
      bytes = hash(bytes);
      bytes[6] = bytes[6] & 15 | version;
      bytes[8] = bytes[8] & 63 | 128;
      if (buf) {
        offset = offset || 0;
        if (offset < 0 || offset + 16 > buf.length) {
          throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
        for (let i = 0; i < 16; ++i) {
          buf[offset + i] = bytes[i];
        }
        return buf;
      }
      return (0, stringify_js_1.unsafeStringify)(bytes);
    }
    exports2.default = v35;
  }
});

// node_modules/uuid/dist/cjs/v3.js
var require_v3 = __commonJS({
  "node_modules/uuid/dist/cjs/v3.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.URL = exports2.DNS = void 0;
    var md5_js_1 = require_md5();
    var v35_js_1 = require_v35();
    var v35_js_2 = require_v35();
    Object.defineProperty(exports2, "DNS", { enumerable: true, get: function() {
      return v35_js_2.DNS;
    } });
    Object.defineProperty(exports2, "URL", { enumerable: true, get: function() {
      return v35_js_2.URL;
    } });
    function v3(value, namespace, buf, offset) {
      return (0, v35_js_1.default)(48, md5_js_1.default, value, namespace, buf, offset);
    }
    v3.DNS = v35_js_1.DNS;
    v3.URL = v35_js_1.URL;
    exports2.default = v3;
  }
});

// node_modules/uuid/dist/cjs/native.js
var require_native = __commonJS({
  "node_modules/uuid/dist/cjs/native.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var crypto_1 = require("crypto");
    exports2.default = { randomUUID: crypto_1.randomUUID };
  }
});

// node_modules/uuid/dist/cjs/v4.js
var require_v4 = __commonJS({
  "node_modules/uuid/dist/cjs/v4.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var native_js_1 = require_native();
    var rng_js_1 = require_rng();
    var stringify_js_1 = require_stringify();
    function v4(options, buf, offset) {
      if (native_js_1.default.randomUUID && !buf && !options) {
        return native_js_1.default.randomUUID();
      }
      options = options || {};
      const rnds = options.random ?? options.rng?.() ?? (0, rng_js_1.default)();
      if (rnds.length < 16) {
        throw new Error("Random bytes length must be >= 16");
      }
      rnds[6] = rnds[6] & 15 | 64;
      rnds[8] = rnds[8] & 63 | 128;
      if (buf) {
        offset = offset || 0;
        if (offset < 0 || offset + 16 > buf.length) {
          throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
        for (let i = 0; i < 16; ++i) {
          buf[offset + i] = rnds[i];
        }
        return buf;
      }
      return (0, stringify_js_1.unsafeStringify)(rnds);
    }
    exports2.default = v4;
  }
});

// node_modules/uuid/dist/cjs/sha1.js
var require_sha1 = __commonJS({
  "node_modules/uuid/dist/cjs/sha1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var crypto_1 = require("crypto");
    function sha1(bytes) {
      if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
      } else if (typeof bytes === "string") {
        bytes = Buffer.from(bytes, "utf8");
      }
      return (0, crypto_1.createHash)("sha1").update(bytes).digest();
    }
    exports2.default = sha1;
  }
});

// node_modules/uuid/dist/cjs/v5.js
var require_v5 = __commonJS({
  "node_modules/uuid/dist/cjs/v5.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.URL = exports2.DNS = void 0;
    var sha1_js_1 = require_sha1();
    var v35_js_1 = require_v35();
    var v35_js_2 = require_v35();
    Object.defineProperty(exports2, "DNS", { enumerable: true, get: function() {
      return v35_js_2.DNS;
    } });
    Object.defineProperty(exports2, "URL", { enumerable: true, get: function() {
      return v35_js_2.URL;
    } });
    function v5(value, namespace, buf, offset) {
      return (0, v35_js_1.default)(80, sha1_js_1.default, value, namespace, buf, offset);
    }
    v5.DNS = v35_js_1.DNS;
    v5.URL = v35_js_1.URL;
    exports2.default = v5;
  }
});

// node_modules/uuid/dist/cjs/v6.js
var require_v6 = __commonJS({
  "node_modules/uuid/dist/cjs/v6.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stringify_js_1 = require_stringify();
    var v1_js_1 = require_v1();
    var v1ToV6_js_1 = require_v1ToV6();
    function v6(options, buf, offset) {
      options ??= {};
      offset ??= 0;
      let bytes = (0, v1_js_1.default)({ ...options, _v6: true }, new Uint8Array(16));
      bytes = (0, v1ToV6_js_1.default)(bytes);
      if (buf) {
        if (offset < 0 || offset + 16 > buf.length) {
          throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
        for (let i = 0; i < 16; i++) {
          buf[offset + i] = bytes[i];
        }
        return buf;
      }
      return (0, stringify_js_1.unsafeStringify)(bytes);
    }
    exports2.default = v6;
  }
});

// node_modules/uuid/dist/cjs/v6ToV1.js
var require_v6ToV1 = __commonJS({
  "node_modules/uuid/dist/cjs/v6ToV1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var parse_js_1 = require_parse();
    var stringify_js_1 = require_stringify();
    function v6ToV1(uuid) {
      const v6Bytes = typeof uuid === "string" ? (0, parse_js_1.default)(uuid) : uuid;
      const v1Bytes = _v6ToV1(v6Bytes);
      return typeof uuid === "string" ? (0, stringify_js_1.unsafeStringify)(v1Bytes) : v1Bytes;
    }
    exports2.default = v6ToV1;
    function _v6ToV1(v6Bytes) {
      return Uint8Array.of((v6Bytes[3] & 15) << 4 | v6Bytes[4] >> 4 & 15, (v6Bytes[4] & 15) << 4 | (v6Bytes[5] & 240) >> 4, (v6Bytes[5] & 15) << 4 | v6Bytes[6] & 15, v6Bytes[7], (v6Bytes[1] & 15) << 4 | (v6Bytes[2] & 240) >> 4, (v6Bytes[2] & 15) << 4 | (v6Bytes[3] & 240) >> 4, 16 | (v6Bytes[0] & 240) >> 4, (v6Bytes[0] & 15) << 4 | (v6Bytes[1] & 240) >> 4, v6Bytes[8], v6Bytes[9], v6Bytes[10], v6Bytes[11], v6Bytes[12], v6Bytes[13], v6Bytes[14], v6Bytes[15]);
    }
  }
});

// node_modules/uuid/dist/cjs/v7.js
var require_v7 = __commonJS({
  "node_modules/uuid/dist/cjs/v7.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.updateV7State = void 0;
    var rng_js_1 = require_rng();
    var stringify_js_1 = require_stringify();
    var _state = {};
    function v7(options, buf, offset) {
      let bytes;
      if (options) {
        bytes = v7Bytes(options.random ?? options.rng?.() ?? (0, rng_js_1.default)(), options.msecs, options.seq, buf, offset);
      } else {
        const now = Date.now();
        const rnds = (0, rng_js_1.default)();
        updateV7State(_state, now, rnds);
        bytes = v7Bytes(rnds, _state.msecs, _state.seq, buf, offset);
      }
      return buf ?? (0, stringify_js_1.unsafeStringify)(bytes);
    }
    function updateV7State(state, now, rnds) {
      state.msecs ??= -Infinity;
      state.seq ??= 0;
      if (now > state.msecs) {
        state.seq = rnds[6] << 23 | rnds[7] << 16 | rnds[8] << 8 | rnds[9];
        state.msecs = now;
      } else {
        state.seq = state.seq + 1 | 0;
        if (state.seq === 0) {
          state.msecs++;
        }
      }
      return state;
    }
    exports2.updateV7State = updateV7State;
    function v7Bytes(rnds, msecs, seq, buf, offset = 0) {
      if (rnds.length < 16) {
        throw new Error("Random bytes length must be >= 16");
      }
      if (!buf) {
        buf = new Uint8Array(16);
        offset = 0;
      } else {
        if (offset < 0 || offset + 16 > buf.length) {
          throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
        }
      }
      msecs ??= Date.now();
      seq ??= rnds[6] * 127 << 24 | rnds[7] << 16 | rnds[8] << 8 | rnds[9];
      buf[offset++] = msecs / 1099511627776 & 255;
      buf[offset++] = msecs / 4294967296 & 255;
      buf[offset++] = msecs / 16777216 & 255;
      buf[offset++] = msecs / 65536 & 255;
      buf[offset++] = msecs / 256 & 255;
      buf[offset++] = msecs & 255;
      buf[offset++] = 112 | seq >>> 28 & 15;
      buf[offset++] = seq >>> 20 & 255;
      buf[offset++] = 128 | seq >>> 14 & 63;
      buf[offset++] = seq >>> 6 & 255;
      buf[offset++] = seq << 2 & 255 | rnds[10] & 3;
      buf[offset++] = rnds[11];
      buf[offset++] = rnds[12];
      buf[offset++] = rnds[13];
      buf[offset++] = rnds[14];
      buf[offset++] = rnds[15];
      return buf;
    }
    exports2.default = v7;
  }
});

// node_modules/uuid/dist/cjs/version.js
var require_version = __commonJS({
  "node_modules/uuid/dist/cjs/version.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var validate_js_1 = require_validate();
    function version(uuid) {
      if (!(0, validate_js_1.default)(uuid)) {
        throw TypeError("Invalid UUID");
      }
      return parseInt(uuid.slice(14, 15), 16);
    }
    exports2.default = version;
  }
});

// node_modules/uuid/dist/cjs/index.js
var require_cjs = __commonJS({
  "node_modules/uuid/dist/cjs/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.version = exports2.validate = exports2.v7 = exports2.v6ToV1 = exports2.v6 = exports2.v5 = exports2.v4 = exports2.v3 = exports2.v1ToV6 = exports2.v1 = exports2.stringify = exports2.parse = exports2.NIL = exports2.MAX = void 0;
    var max_js_1 = require_max();
    Object.defineProperty(exports2, "MAX", { enumerable: true, get: function() {
      return max_js_1.default;
    } });
    var nil_js_1 = require_nil();
    Object.defineProperty(exports2, "NIL", { enumerable: true, get: function() {
      return nil_js_1.default;
    } });
    var parse_js_1 = require_parse();
    Object.defineProperty(exports2, "parse", { enumerable: true, get: function() {
      return parse_js_1.default;
    } });
    var stringify_js_1 = require_stringify();
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return stringify_js_1.default;
    } });
    var v1_js_1 = require_v1();
    Object.defineProperty(exports2, "v1", { enumerable: true, get: function() {
      return v1_js_1.default;
    } });
    var v1ToV6_js_1 = require_v1ToV6();
    Object.defineProperty(exports2, "v1ToV6", { enumerable: true, get: function() {
      return v1ToV6_js_1.default;
    } });
    var v3_js_1 = require_v3();
    Object.defineProperty(exports2, "v3", { enumerable: true, get: function() {
      return v3_js_1.default;
    } });
    var v4_js_1 = require_v4();
    Object.defineProperty(exports2, "v4", { enumerable: true, get: function() {
      return v4_js_1.default;
    } });
    var v5_js_1 = require_v5();
    Object.defineProperty(exports2, "v5", { enumerable: true, get: function() {
      return v5_js_1.default;
    } });
    var v6_js_1 = require_v6();
    Object.defineProperty(exports2, "v6", { enumerable: true, get: function() {
      return v6_js_1.default;
    } });
    var v6ToV1_js_1 = require_v6ToV1();
    Object.defineProperty(exports2, "v6ToV1", { enumerable: true, get: function() {
      return v6ToV1_js_1.default;
    } });
    var v7_js_1 = require_v7();
    Object.defineProperty(exports2, "v7", { enumerable: true, get: function() {
      return v7_js_1.default;
    } });
    var validate_js_1 = require_validate();
    Object.defineProperty(exports2, "validate", { enumerable: true, get: function() {
      return validate_js_1.default;
    } });
    var version_js_1 = require_version();
    Object.defineProperty(exports2, "version", { enumerable: true, get: function() {
      return version_js_1.default;
    } });
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/AccessKey.js
var require_AccessKey = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/AccessKey.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AccessKey = void 0;
    exports2.accessKeyBuild = accessKeyBuild;
    exports2.accessKeyCreate = accessKeyCreate;
    exports2.accessKeyDeserialize = accessKeyDeserialize2;
    exports2.accessKeySerialize = accessKeySerialize;
    exports2.parseResource = parseResource;
    exports2.parseResources = parseResources2;
    exports2.buildResource = buildResource;
    var uuid_1 = require_cjs();
    var AccessKey2 = class {
      constructor() {
        this.id = "";
        this.type = "volatile";
        this.resources = "";
      }
    };
    exports2.AccessKey = AccessKey2;
    function accessKeyCreate(type, resources) {
      let accessKey = new AccessKey2();
      accessKey.id = (0, uuid_1.v4)();
      accessKey.type = type;
      accessKey.resources = resources;
      return accessKey;
    }
    function accessKeyBuild(id, type, resources) {
      let accessKey = new AccessKey2();
      accessKey.id = id;
      accessKey.type = type;
      accessKey.resources = resources;
      return accessKey;
    }
    function accessKeySerialize(accessKey) {
      return `${accessKey.id}|${accessKey.type}|${accessKey.resources}`;
    }
    function accessKeyDeserialize2(key) {
      var parts = key.split("|");
      return accessKeyBuild(parts[0], parts[1], parts[2]);
    }
    function parseResource(key) {
      var parts = key.split(":");
      return {
        scopes: parts[0],
        namespaces: parts[1],
        groups: parts[2],
        pods: parts[3],
        containers: parts[4]
      };
    }
    function parseResources2(key) {
      if (!key)
        return [];
      let ress = key.split(";");
      let result = [];
      for (var res of ress) {
        result.push(parseResource(res));
      }
      return result;
    }
    function buildResource(scopes, namespaces, groups, pods, containers) {
      return `${scopes.join(",")}:${namespaces.join(",")}:${groups.join(",")}:${pods.join(",")}:${containers.join(",")}`;
    }
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/Global.js
var require_Global = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/Global.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/Version.js
var require_Version = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/Version.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.versionGreaterThan = exports2.versionGreatOrEqualThan = void 0;
    var versionGreatOrEqualThan = (version1, version2) => {
      return versionGreaterThan(version1, version2) || version1 === version2;
    };
    exports2.versionGreatOrEqualThan = versionGreatOrEqualThan;
    var versionGreaterThan = (version1, version2) => {
      const v1 = version1.split(".").map(Number);
      const v2 = version2.split(".").map(Number);
      for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const num1 = v1[i] || 0;
        const num2 = v2[i] || 0;
        if (num1 > num2)
          return true;
        else if (num1 < num2)
          return false;
      }
      return false;
    };
    exports2.versionGreaterThan = versionGreaterThan;
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/FrontChannel.js
var require_FrontChannel = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/FrontChannel.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EChannelRefreshAction = exports2.ENotifyLevel = void 0;
    var ENotifyLevel;
    (function(ENotifyLevel2) {
      ENotifyLevel2["INFO"] = "info";
      ENotifyLevel2["ERROR"] = "error";
      ENotifyLevel2["WARNING"] = "warning";
      ENotifyLevel2["SUCCESS"] = "success";
    })(ENotifyLevel || (exports2.ENotifyLevel = ENotifyLevel = {}));
    var EChannelRefreshAction;
    (function(EChannelRefreshAction2) {
      EChannelRefreshAction2[EChannelRefreshAction2["NONE"] = 0] = "NONE";
      EChannelRefreshAction2[EChannelRefreshAction2["REFRESH"] = 1] = "REFRESH";
      EChannelRefreshAction2[EChannelRefreshAction2["STOP"] = 2] = "STOP";
    })(EChannelRefreshAction || (exports2.EChannelRefreshAction = EChannelRefreshAction = {}));
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/Daemon.js
var require_Daemon = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/Daemon.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// node_modules/@kwirthmagnify/kwirth-common/dist/index.js
var require_dist = __commonJS({
  "node_modules/@kwirthmagnify/kwirth-common/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_Channel(), exports2);
    __exportStar(require_Sender(), exports2);
    __exportStar(require_InstanceMessage(), exports2);
    __exportStar(require_InstanceConfig(), exports2);
    __exportStar(require_RouteMessage(), exports2);
    __exportStar(require_SignalMessage(), exports2);
    __exportStar(require_ApiKey(), exports2);
    __exportStar(require_AccessKey(), exports2);
    __exportStar(require_Global(), exports2);
    __exportStar(require_Version(), exports2);
    __exportStar(require_FrontChannel(), exports2);
    __exportStar(require_Daemon(), exports2);
  }
});

// src/back/index.ts
var index_exports = {};
__export(index_exports, {
  TrivyChannel: () => TrivyChannel
});
module.exports = __toCommonJS(index_exports);
var import_kwirth_common = __toESM(require_dist(), 1);
var import_client_node = require("@kubernetes/client-node");
var import_kwirth_common_back = require("@kwirthmagnify/kwirth-common-back");

// src/back/trivy-operator-0.30.1.yaml
var trivy_operator_0_30_1_default = '---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: clustercompliancereports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ClusterComplianceReport\r\n    listKind: ClusterComplianceReportList\r\n    plural: clustercompliancereports\r\n    shortNames:\r\n    - compliance\r\n    singular: clustercompliancereport\r\n  scope: Cluster\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of checks that failed\r\n      jsonPath: .status.summary.failCount\r\n      name: Fail\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of checks that passed\r\n      jsonPath: .status.summary.passCount\r\n      name: Pass\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ClusterComplianceReport is a specification for the ClusterComplianceReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          spec:\r\n            description: ReportSpec represent the compliance specification\r\n            properties:\r\n              compliance:\r\n                properties:\r\n                  controls:\r\n                    description: Control represent the cps controls data and mapping\r\n                      checks\r\n                    items:\r\n                      description: Control represent the cps controls data and mapping\r\n                        checks\r\n                      properties:\r\n                        checks:\r\n                          items:\r\n                            description: SpecCheck represent the scanner who perform\r\n                              the control check\r\n                            properties:\r\n                              id:\r\n                                description: id define the check id as produced by\r\n                                  scanner\r\n                                type: string\r\n                            required:\r\n                            - id\r\n                            type: object\r\n                          type: array\r\n                        commands:\r\n                          items:\r\n                            description: Commands represent the commands to be executed\r\n                              by the node-collector\r\n                            properties:\r\n                              id:\r\n                                description: id define the commands id\r\n                                type: string\r\n                            required:\r\n                            - id\r\n                            type: object\r\n                          type: array\r\n                        defaultStatus:\r\n                          description: define the default value for check status in\r\n                            case resource not found\r\n                          enum:\r\n                          - PASS\r\n                          - WARN\r\n                          - FAIL\r\n                          type: string\r\n                        description:\r\n                          type: string\r\n                        id:\r\n                          description: id define the control check id\r\n                          type: string\r\n                        name:\r\n                          type: string\r\n                        severity:\r\n                          description: define the severity of the control\r\n                          enum:\r\n                          - CRITICAL\r\n                          - HIGH\r\n                          - MEDIUM\r\n                          - LOW\r\n                          - UNKNOWN\r\n                          type: string\r\n                      required:\r\n                      - id\r\n                      - name\r\n                      - severity\r\n                      type: object\r\n                    type: array\r\n                  description:\r\n                    type: string\r\n                  id:\r\n                    type: string\r\n                  platform:\r\n                    type: string\r\n                  relatedResources:\r\n                    items:\r\n                      type: string\r\n                    type: array\r\n                  title:\r\n                    type: string\r\n                  type:\r\n                    type: string\r\n                  version:\r\n                    type: string\r\n                required:\r\n                - controls\r\n                - description\r\n                - id\r\n                - platform\r\n                - relatedResources\r\n                - title\r\n                - type\r\n                - version\r\n                type: object\r\n              cron:\r\n                description: cron define the intervals for report generation\r\n                pattern: ^(((([\\*]{1}){1})|((\\*\\/){0,1}(([0-9]{1}){1}|(([1-5]{1}){1}([0-9]{1}){1}){1})))\r\n                  ((([\\*]{1}){1})|((\\*\\/){0,1}(([0-9]{1}){1}|(([1]{1}){1}([0-9]{1}){1}){1}|([2]{1}){1}([0-3]{1}){1})))\r\n                  ((([\\*]{1}){1})|((\\*\\/){0,1}(([1-9]{1}){1}|(([1-2]{1}){1}([0-9]{1}){1}){1}|([3]{1}){1}([0-1]{1}){1})))\r\n                  ((([\\*]{1}){1})|((\\*\\/){0,1}(([1-9]{1}){1}|(([1-2]{1}){1}([0-9]{1}){1}){1}|([3]{1}){1}([0-1]{1}){1}))|(jan|feb|mar|apr|may|jun|jul|aug|sep|okt|nov|dec))\r\n                  ((([\\*]{1}){1})|((\\*\\/){0,1}(([0-7]{1}){1}))|(sun|mon|tue|wed|thu|fri|sat)))$\r\n                type: string\r\n              reportType:\r\n                enum:\r\n                - summary\r\n                - all\r\n                type: string\r\n            required:\r\n            - compliance\r\n            - cron\r\n            - reportType\r\n            type: object\r\n          status:\r\n            properties:\r\n              detailReport:\r\n                description: ComplianceReport represents a kubernetes scan report\r\n                properties:\r\n                  description:\r\n                    type: string\r\n                  id:\r\n                    type: string\r\n                  relatedVersion:\r\n                    items:\r\n                      type: string\r\n                    type: array\r\n                  results:\r\n                    items:\r\n                      properties:\r\n                        checks:\r\n                          items:\r\n                            description: ComplianceCheck provides the result of conducting\r\n                              a single compliance step.\r\n                            properties:\r\n                              category:\r\n                                type: string\r\n                              checkID:\r\n                                type: string\r\n                              description:\r\n                                type: string\r\n                              messages:\r\n                                items:\r\n                                  type: string\r\n                                type: array\r\n                              remediation:\r\n                                description: Remediation provides description or links\r\n                                  to external resources to remediate failing check.\r\n                                type: string\r\n                              severity:\r\n                                description: Severity level of a vulnerability or\r\n                                  a configuration audit check.\r\n                                type: string\r\n                              success:\r\n                                type: boolean\r\n                              target:\r\n                                type: string\r\n                              title:\r\n                                type: string\r\n                            required:\r\n                            - checkID\r\n                            - severity\r\n                            - success\r\n                            type: object\r\n                          type: array\r\n                        description:\r\n                          type: string\r\n                        id:\r\n                          type: string\r\n                        name:\r\n                          type: string\r\n                        severity:\r\n                          type: string\r\n                        status:\r\n                          type: string\r\n                      required:\r\n                      - checks\r\n                      type: object\r\n                    type: array\r\n                  title:\r\n                    type: string\r\n                  version:\r\n                    type: string\r\n                type: object\r\n                x-kubernetes-preserve-unknown-fields: true\r\n              summary:\r\n                properties:\r\n                  failCount:\r\n                    type: integer\r\n                  passCount:\r\n                    type: integer\r\n                type: object\r\n              summaryReport:\r\n                description: SummaryReport represents a kubernetes scan report with\r\n                  consolidated findings\r\n                properties:\r\n                  controlCheck:\r\n                    items:\r\n                      properties:\r\n                        id:\r\n                          type: string\r\n                        name:\r\n                          type: string\r\n                        severity:\r\n                          type: string\r\n                        totalFail:\r\n                          type: integer\r\n                      type: object\r\n                    type: array\r\n                  id:\r\n                    type: string\r\n                  title:\r\n                    type: string\r\n                type: object\r\n                x-kubernetes-preserve-unknown-fields: true\r\n              updateTimestamp:\r\n                format: date-time\r\n                type: string\r\n            required:\r\n            - updateTimestamp\r\n            type: object\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources:\r\n      status: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: clusterconfigauditreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ClusterConfigAuditReport\r\n    listKind: ClusterConfigAuditReportList\r\n    plural: clusterconfigauditreports\r\n    shortNames:\r\n    - clusterconfigaudit\r\n    singular: clusterconfigauditreport\r\n  scope: Cluster\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of the config audit scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of failed checks with critical severity\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with high severity\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with medium severity\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with low severity\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ClusterConfigAuditReport is a specification for the ClusterConfigAuditReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            properties:\r\n              checks:\r\n                description: Checks provides results of conducting audit steps.\r\n                items:\r\n                  description: Check provides the result of conducting a single audit\r\n                    step.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    checkID:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    messages:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    remediation:\r\n                      description: Remediation provides description or links to external\r\n                        resources to remediate failing check.\r\n                      type: string\r\n                    scope:\r\n                      description: Scope indicates the section of config that was\r\n                        audited.\r\n                      properties:\r\n                        type:\r\n                          description: Type indicates type of this scope, e.g. Container,\r\n                            ConfigMapKey or JSONPath.\r\n                          type: string\r\n                        value:\r\n                          description: Value indicates value of this scope that depends\r\n                            on Type, e.g. container name, ConfigMap key or JSONPath\r\n                            expression\r\n                          type: string\r\n                      required:\r\n                      - type\r\n                      - value\r\n                      type: object\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      type: string\r\n                    success:\r\n                      type: boolean\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - checkID\r\n                  - severity\r\n                  - success\r\n                  type: object\r\n                type: array\r\n              scanner:\r\n                description: Scanner is the spec for a scanner generating a security\r\n                  assessment report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: ConfigAuditSummary counts failed checks by severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of failed checks with\r\n                      critical severity.\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of failed checks with high\r\n                      severity.\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of failed check with low severity.\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of failed checks with medium\r\n                      severity.\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n              updateTimestamp:\r\n                format: date-time\r\n                type: string\r\n            required:\r\n            - checks\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: clusterinfraassessmentreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ClusterInfraAssessmentReport\r\n    listKind: ClusterInfraAssessmentReportList\r\n    plural: clusterinfraassessmentreports\r\n    shortNames:\r\n    - clusterinfraassessment\r\n    singular: clusterinfraassessmentreport\r\n  scope: Cluster\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of the infra assessement scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of failed checks with critical severity\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with high severity\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with medium severity\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with low severity\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ClusterInfraAssessmentReport is a specification for the ClusterInfraAssessmentReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            properties:\r\n              checks:\r\n                description: Checks provides results of conducting audit steps.\r\n                items:\r\n                  description: Check provides the result of conducting a single audit\r\n                    step.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    checkID:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    messages:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    remediation:\r\n                      description: Remediation provides description or links to external\r\n                        resources to remediate failing check.\r\n                      type: string\r\n                    scope:\r\n                      description: Scope indicates the section of config that was\r\n                        audited.\r\n                      properties:\r\n                        type:\r\n                          description: Type indicates type of this scope, e.g. Container,\r\n                            ConfigMapKey or JSONPath.\r\n                          type: string\r\n                        value:\r\n                          description: Value indicates value of this scope that depends\r\n                            on Type, e.g. container name, ConfigMap key or JSONPath\r\n                            expression\r\n                          type: string\r\n                      required:\r\n                      - type\r\n                      - value\r\n                      type: object\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      type: string\r\n                    success:\r\n                      type: boolean\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - checkID\r\n                  - severity\r\n                  - success\r\n                  type: object\r\n                type: array\r\n              scanner:\r\n                description: Scanner is the spec for a scanner generating a security\r\n                  assessment report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: InfraAssessmentSummary counts failed checks by severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of failed checks with\r\n                      critical severity.\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of failed checks with high\r\n                      severity.\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of failed check with low severity.\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of failed checks with medium\r\n                      severity.\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n            required:\r\n            - checks\r\n            - scanner\r\n            - summary\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: clusterrbacassessmentreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ClusterRbacAssessmentReport\r\n    listKind: ClusterRbacAssessmentReportList\r\n    plural: clusterrbacassessmentreports\r\n    shortNames:\r\n    - clusterrbacassessmentreport\r\n    singular: clusterrbacassessmentreport\r\n  scope: Cluster\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of the rbac assessment scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of failed checks with critical severity\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with high severity\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with medium severity\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with low severity\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ClusterRbacAssessmentReport is a specification for the ClusterRbacAssessmentReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            properties:\r\n              checks:\r\n                description: Checks provides results of conducting audit steps.\r\n                items:\r\n                  description: Check provides the result of conducting a single audit\r\n                    step.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    checkID:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    messages:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    remediation:\r\n                      description: Remediation provides description or links to external\r\n                        resources to remediate failing check.\r\n                      type: string\r\n                    scope:\r\n                      description: Scope indicates the section of config that was\r\n                        audited.\r\n                      properties:\r\n                        type:\r\n                          description: Type indicates type of this scope, e.g. Container,\r\n                            ConfigMapKey or JSONPath.\r\n                          type: string\r\n                        value:\r\n                          description: Value indicates value of this scope that depends\r\n                            on Type, e.g. container name, ConfigMap key or JSONPath\r\n                            expression\r\n                          type: string\r\n                      required:\r\n                      - type\r\n                      - value\r\n                      type: object\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      type: string\r\n                    success:\r\n                      type: boolean\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - checkID\r\n                  - severity\r\n                  - success\r\n                  type: object\r\n                type: array\r\n              scanner:\r\n                description: Scanner is the spec for a scanner generating a security\r\n                  assessment report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: RbacAssessmentSummary counts failed checks by severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of failed checks with\r\n                      critical severity.\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of failed checks with high\r\n                      severity.\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of failed check with low severity.\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of failed checks with medium\r\n                      severity.\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n            required:\r\n            - checks\r\n            - scanner\r\n            - summary\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: clustersbomreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ClusterSbomReport\r\n    listKind: ClusterSbomReportList\r\n    plural: clustersbomreports\r\n    shortNames:\r\n    - clustersbom\r\n    singular: clustersbomreport\r\n  scope: Cluster\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of image repository\r\n      jsonPath: .report.artifact.repository\r\n      name: Repository\r\n      type: string\r\n    - description: The name of image tag\r\n      jsonPath: .report.artifact.tag\r\n      name: Tag\r\n      type: string\r\n    - description: The name of the sbom generation scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of dependencies in bom\r\n      jsonPath: .report.summary.componentsCount\r\n      name: Components\r\n      priority: 1\r\n      type: integer\r\n    - description: The the number of components in bom\r\n      jsonPath: .report.summary.dependenciesCount\r\n      name: Dependencies\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ClusterSbomReport summarizes components and dependencies found\r\n          in container image\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            description: Report is the actual sbom report data.\r\n            properties:\r\n              artifact:\r\n                description: |-\r\n                  Artifact represents a standalone, executable package of software that includes everything needed to\r\n                  run an application.\r\n                properties:\r\n                  digest:\r\n                    description: Digest is a unique and immutable identifier of an\r\n                      Artifact.\r\n                    type: string\r\n                  mimeType:\r\n                    description: MimeType represents a type and format of an Artifact.\r\n                    type: string\r\n                  repository:\r\n                    description: Repository is the name of the repository in the Artifact\r\n                      registry.\r\n                    type: string\r\n                  tag:\r\n                    description: Tag is a mutable, human-readable string used to identify\r\n                      an Artifact.\r\n                    type: string\r\n                type: object\r\n              components:\r\n                description: Bom is artifact bill of materials.\r\n                properties:\r\n                  bomFormat:\r\n                    type: string\r\n                  components:\r\n                    items:\r\n                      properties:\r\n                        bom-ref:\r\n                          type: string\r\n                        group:\r\n                          type: string\r\n                        hashes:\r\n                          items:\r\n                            properties:\r\n                              alg:\r\n                                type: string\r\n                              content:\r\n                                type: string\r\n                            type: object\r\n                          type: array\r\n                        licenses:\r\n                          items:\r\n                            properties:\r\n                              expression:\r\n                                type: string\r\n                              license:\r\n                                properties:\r\n                                  id:\r\n                                    type: string\r\n                                  name:\r\n                                    type: string\r\n                                  url:\r\n                                    type: string\r\n                                type: object\r\n                            type: object\r\n                          type: array\r\n                        name:\r\n                          type: string\r\n                        properties:\r\n                          items:\r\n                            properties:\r\n                              name:\r\n                                type: string\r\n                              value:\r\n                                type: string\r\n                            type: object\r\n                          type: array\r\n                        purl:\r\n                          type: string\r\n                        supplier:\r\n                          properties:\r\n                            contact:\r\n                              items:\r\n                                properties:\r\n                                  email:\r\n                                    type: string\r\n                                  name:\r\n                                    type: string\r\n                                  phone:\r\n                                    type: string\r\n                                type: object\r\n                              type: array\r\n                            name:\r\n                              type: string\r\n                            url:\r\n                              items:\r\n                                type: string\r\n                              type: array\r\n                          type: object\r\n                        type:\r\n                          type: string\r\n                        version:\r\n                          type: string\r\n                      type: object\r\n                    type: array\r\n                  dependencies:\r\n                    items:\r\n                      properties:\r\n                        dependsOn:\r\n                          items:\r\n                            type: string\r\n                          type: array\r\n                        ref:\r\n                          type: string\r\n                      type: object\r\n                    type: array\r\n                  metadata:\r\n                    properties:\r\n                      component:\r\n                        properties:\r\n                          bom-ref:\r\n                            type: string\r\n                          group:\r\n                            type: string\r\n                          hashes:\r\n                            items:\r\n                              properties:\r\n                                alg:\r\n                                  type: string\r\n                                content:\r\n                                  type: string\r\n                              type: object\r\n                            type: array\r\n                          licenses:\r\n                            items:\r\n                              properties:\r\n                                expression:\r\n                                  type: string\r\n                                license:\r\n                                  properties:\r\n                                    id:\r\n                                      type: string\r\n                                    name:\r\n                                      type: string\r\n                                    url:\r\n                                      type: string\r\n                                  type: object\r\n                              type: object\r\n                            type: array\r\n                          name:\r\n                            type: string\r\n                          properties:\r\n                            items:\r\n                              properties:\r\n                                name:\r\n                                  type: string\r\n                                value:\r\n                                  type: string\r\n                              type: object\r\n                            type: array\r\n                          purl:\r\n                            type: string\r\n                          supplier:\r\n                            properties:\r\n                              contact:\r\n                                items:\r\n                                  properties:\r\n                                    email:\r\n                                      type: string\r\n                                    name:\r\n                                      type: string\r\n                                    phone:\r\n                                      type: string\r\n                                  type: object\r\n                                type: array\r\n                              name:\r\n                                type: string\r\n                              url:\r\n                                items:\r\n                                  type: string\r\n                                type: array\r\n                            type: object\r\n                          type:\r\n                            type: string\r\n                          version:\r\n                            type: string\r\n                        type: object\r\n                      timestamp:\r\n                        type: string\r\n                      tools:\r\n                        properties:\r\n                          components:\r\n                            items:\r\n                              properties:\r\n                                bom-ref:\r\n                                  type: string\r\n                                group:\r\n                                  type: string\r\n                                hashes:\r\n                                  items:\r\n                                    properties:\r\n                                      alg:\r\n                                        type: string\r\n                                      content:\r\n                                        type: string\r\n                                    type: object\r\n                                  type: array\r\n                                licenses:\r\n                                  items:\r\n                                    properties:\r\n                                      expression:\r\n                                        type: string\r\n                                      license:\r\n                                        properties:\r\n                                          id:\r\n                                            type: string\r\n                                          name:\r\n                                            type: string\r\n                                          url:\r\n                                            type: string\r\n                                        type: object\r\n                                    type: object\r\n                                  type: array\r\n                                name:\r\n                                  type: string\r\n                                properties:\r\n                                  items:\r\n                                    properties:\r\n                                      name:\r\n                                        type: string\r\n                                      value:\r\n                                        type: string\r\n                                    type: object\r\n                                  type: array\r\n                                purl:\r\n                                  type: string\r\n                                supplier:\r\n                                  properties:\r\n                                    contact:\r\n                                      items:\r\n                                        properties:\r\n                                          email:\r\n                                            type: string\r\n                                          name:\r\n                                            type: string\r\n                                          phone:\r\n                                            type: string\r\n                                        type: object\r\n                                      type: array\r\n                                    name:\r\n                                      type: string\r\n                                    url:\r\n                                      items:\r\n                                        type: string\r\n                                      type: array\r\n                                  type: object\r\n                                type:\r\n                                  type: string\r\n                                version:\r\n                                  type: string\r\n                              type: object\r\n                            type: array\r\n                        type: object\r\n                    type: object\r\n                  serialNumber:\r\n                    type: string\r\n                  specVersion:\r\n                    type: string\r\n                  version:\r\n                    type: integer\r\n                required:\r\n                - bomFormat\r\n                - specVersion\r\n                type: object\r\n              registry:\r\n                description: Registry is the registry the Artifact was pulled from.\r\n                properties:\r\n                  server:\r\n                    description: Server the FQDN of registry server.\r\n                    type: string\r\n                type: object\r\n              scanner:\r\n                description: Scanner is the scanner that generated this report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: Summary is a summary of sbom report.\r\n                properties:\r\n                  componentsCount:\r\n                    description: ComponentsCount is the number of components in bom.\r\n                    minimum: 0\r\n                    type: integer\r\n                  dependenciesCount:\r\n                    description: DependenciesCount is the number of dependencies in\r\n                      bom.\r\n                    minimum: 0\r\n                    type: integer\r\n                required:\r\n                - componentsCount\r\n                - dependenciesCount\r\n                type: object\r\n              updateTimestamp:\r\n                description: UpdateTimestamp is a timestamp representing the server\r\n                  time in UTC when this report was updated.\r\n                format: date-time\r\n                type: string\r\n            required:\r\n            - artifact\r\n            - components\r\n            - scanner\r\n            - summary\r\n            - updateTimestamp\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: clustervulnerabilityreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ClusterVulnerabilityReport\r\n    listKind: ClusterVulnerabilityReportList\r\n    plural: clustervulnerabilityreports\r\n    shortNames:\r\n    - clustervuln\r\n    singular: clustervulnerabilityreport\r\n  scope: Cluster\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of image repository\r\n      jsonPath: .report.artifact.repository\r\n      name: Repository\r\n      type: string\r\n    - description: The name of image tag\r\n      jsonPath: .report.artifact.tag\r\n      name: Tag\r\n      type: string\r\n    - description: The name of the vulnerability scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of critical vulnerabilities\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of high vulnerabilities\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of medium vulnerabilities\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of low vulnerabilities\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of unknown vulnerabilities\r\n      jsonPath: .report.summary.unknownCount\r\n      name: Unknown\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: |-\r\n          ClusterVulnerabilityReport summarizes vulnerabilities in application dependencies and operating system packages\r\n          built into container images.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            description: Report is the actual vulnerability report data.\r\n            properties:\r\n              artifact:\r\n                description: |-\r\n                  Artifact represents a standalone, executable package of software that includes everything needed to\r\n                  run an application.\r\n                properties:\r\n                  digest:\r\n                    description: Digest is a unique and immutable identifier of an\r\n                      Artifact.\r\n                    type: string\r\n                  mimeType:\r\n                    description: MimeType represents a type and format of an Artifact.\r\n                    type: string\r\n                  repository:\r\n                    description: Repository is the name of the repository in the Artifact\r\n                      registry.\r\n                    type: string\r\n                  tag:\r\n                    description: Tag is a mutable, human-readable string used to identify\r\n                      an Artifact.\r\n                    type: string\r\n                type: object\r\n              os:\r\n                description: OS information of the artifact\r\n                properties:\r\n                  eosl:\r\n                    description: Eosl is true if OS version has reached end of service\r\n                      life\r\n                    type: boolean\r\n                  family:\r\n                    description: Operating System Family\r\n                    type: string\r\n                  name:\r\n                    description: Name or version of the OS\r\n                    type: string\r\n                type: object\r\n              registry:\r\n                description: Registry is the registry the Artifact was pulled from.\r\n                properties:\r\n                  server:\r\n                    description: Server the FQDN of registry server.\r\n                    type: string\r\n                type: object\r\n              scanner:\r\n                description: Scanner is the scanner that generated this report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: Summary is a summary of Vulnerability counts grouped\r\n                  by Severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of vulnerabilities with\r\n                      Critical Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of vulnerabilities with High\r\n                      Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of vulnerabilities with Low\r\n                      Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of vulnerabilities with\r\n                      Medium Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  noneCount:\r\n                    description: NoneCount is the number of packages without any vulnerability.\r\n                    minimum: 0\r\n                    type: integer\r\n                  unknownCount:\r\n                    description: UnknownCount is the number of vulnerabilities with\r\n                      unknown severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                - unknownCount\r\n                type: object\r\n              updateTimestamp:\r\n                description: UpdateTimestamp is a timestamp representing the server\r\n                  time in UTC when this report was updated.\r\n                format: date-time\r\n                type: string\r\n              vulnerabilities:\r\n                description: Vulnerabilities is a list of operating system (OS) or\r\n                  application software Vulnerability items found in the Artifact.\r\n                items:\r\n                  description: Vulnerability is the spec for a vulnerability record.\r\n                  properties:\r\n                    class:\r\n                      type: string\r\n                    cvss:\r\n                      additionalProperties:\r\n                        properties:\r\n                          V2Score:\r\n                            type: number\r\n                          V2Vector:\r\n                            type: string\r\n                          V3Score:\r\n                            type: number\r\n                          V3Vector:\r\n                            type: string\r\n                          V40Score:\r\n                            type: number\r\n                          V40Vector:\r\n                            type: string\r\n                        type: object\r\n                      type: object\r\n                    cvsssource:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    fixedVersion:\r\n                      description: FixedVersion indicates the version of the Resource\r\n                        in which this vulnerability has been fixed.\r\n                      type: string\r\n                    installedVersion:\r\n                      description: InstalledVersion indicates the installed version\r\n                        of the Resource.\r\n                      type: string\r\n                    lastModifiedDate:\r\n                      description: LastModifiedDate indicates the last date CVE has\r\n                        been modified.\r\n                      type: string\r\n                    links:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    packagePURL:\r\n                      type: string\r\n                    packagePath:\r\n                      type: string\r\n                    packageType:\r\n                      type: string\r\n                    primaryLink:\r\n                      type: string\r\n                    publishedDate:\r\n                      description: PublishedDate indicates the date of published CVE.\r\n                      type: string\r\n                    resource:\r\n                      description: Resource is a vulnerable package, application,\r\n                        or library.\r\n                      type: string\r\n                    score:\r\n                      type: number\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      enum:\r\n                      - CRITICAL\r\n                      - HIGH\r\n                      - MEDIUM\r\n                      - LOW\r\n                      - UNKNOWN\r\n                      type: string\r\n                    target:\r\n                      type: string\r\n                    title:\r\n                      type: string\r\n                    vulnerabilityID:\r\n                      description: VulnerabilityID the vulnerability identifier.\r\n                      type: string\r\n                  required:\r\n                  - fixedVersion\r\n                  - installedVersion\r\n                  - lastModifiedDate\r\n                  - publishedDate\r\n                  - resource\r\n                  - severity\r\n                  - title\r\n                  - vulnerabilityID\r\n                  type: object\r\n                type: array\r\n            required:\r\n            - artifact\r\n            - os\r\n            - scanner\r\n            - summary\r\n            - updateTimestamp\r\n            - vulnerabilities\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: configauditreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ConfigAuditReport\r\n    listKind: ConfigAuditReportList\r\n    plural: configauditreports\r\n    shortNames:\r\n    - configaudit\r\n    - configaudits\r\n    singular: configauditreport\r\n  scope: Namespaced\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of the config audit scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of failed checks with critical severity\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with high severity\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with medium severity\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with low severity\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ConfigAuditReport is a specification for the ConfigAuditReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            properties:\r\n              checks:\r\n                description: Checks provides results of conducting audit steps.\r\n                items:\r\n                  description: Check provides the result of conducting a single audit\r\n                    step.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    checkID:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    messages:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    remediation:\r\n                      description: Remediation provides description or links to external\r\n                        resources to remediate failing check.\r\n                      type: string\r\n                    scope:\r\n                      description: Scope indicates the section of config that was\r\n                        audited.\r\n                      properties:\r\n                        type:\r\n                          description: Type indicates type of this scope, e.g. Container,\r\n                            ConfigMapKey or JSONPath.\r\n                          type: string\r\n                        value:\r\n                          description: Value indicates value of this scope that depends\r\n                            on Type, e.g. container name, ConfigMap key or JSONPath\r\n                            expression\r\n                          type: string\r\n                      required:\r\n                      - type\r\n                      - value\r\n                      type: object\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      type: string\r\n                    success:\r\n                      type: boolean\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - checkID\r\n                  - severity\r\n                  - success\r\n                  type: object\r\n                type: array\r\n              scanner:\r\n                description: Scanner is the spec for a scanner generating a security\r\n                  assessment report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: ConfigAuditSummary counts failed checks by severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of failed checks with\r\n                      critical severity.\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of failed checks with high\r\n                      severity.\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of failed check with low severity.\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of failed checks with medium\r\n                      severity.\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n              updateTimestamp:\r\n                format: date-time\r\n                type: string\r\n            required:\r\n            - checks\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: exposedsecretreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: ExposedSecretReport\r\n    listKind: ExposedSecretReportList\r\n    plural: exposedsecretreports\r\n    shortNames:\r\n    - exposedsecret\r\n    - exposedsecrets\r\n    singular: exposedsecretreport\r\n  scope: Namespaced\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of image repository\r\n      jsonPath: .report.artifact.repository\r\n      name: Repository\r\n      type: string\r\n    - description: The name of image tag\r\n      jsonPath: .report.artifact.tag\r\n      name: Tag\r\n      type: string\r\n    - description: The name of the exposed secret scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of critical exposed secrets\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of high exposed secrets\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of medium exposed secrets\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of low exposed secrets\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: ExposedSecretReport summarizes exposed secrets in plaintext files\r\n          built into container images.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            description: Report is the actual exposed secret report data.\r\n            properties:\r\n              artifact:\r\n                description: |-\r\n                  Artifact represents a standalone, executable package of software that includes everything needed to\r\n                  run an application.\r\n                properties:\r\n                  digest:\r\n                    description: Digest is a unique and immutable identifier of an\r\n                      Artifact.\r\n                    type: string\r\n                  mimeType:\r\n                    description: MimeType represents a type and format of an Artifact.\r\n                    type: string\r\n                  repository:\r\n                    description: Repository is the name of the repository in the Artifact\r\n                      registry.\r\n                    type: string\r\n                  tag:\r\n                    description: Tag is a mutable, human-readable string used to identify\r\n                      an Artifact.\r\n                    type: string\r\n                type: object\r\n              registry:\r\n                description: Registry is the registry the Artifact was pulled from.\r\n                properties:\r\n                  server:\r\n                    description: Server the FQDN of registry server.\r\n                    type: string\r\n                type: object\r\n              scanner:\r\n                description: Scanner is the scanner that generated this report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              secrets:\r\n                description: Exposed secrets is a list of passwords, api keys, tokens\r\n                  and others items found in the Artifact.\r\n                items:\r\n                  description: ExposedSecret is the spec for a exposed secret record.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    match:\r\n                      description: Match where the exposed rule matched.\r\n                      type: string\r\n                    ruleID:\r\n                      description: RuleID is rule the identifier.\r\n                      type: string\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      enum:\r\n                      - CRITICAL\r\n                      - HIGH\r\n                      - MEDIUM\r\n                      - LOW\r\n                      type: string\r\n                    target:\r\n                      description: Target is where the exposed secret was found.\r\n                      type: string\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - category\r\n                  - match\r\n                  - ruleID\r\n                  - severity\r\n                  - target\r\n                  - title\r\n                  type: object\r\n                type: array\r\n              summary:\r\n                description: Summary is the exposed secrets counts grouped by Severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of exposed secrets with\r\n                      Critical Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of exposed secrets with High\r\n                      Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of exposed secrets with Low\r\n                      Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of exposed secrets with\r\n                      Medium Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n              updateTimestamp:\r\n                description: UpdateTimestamp is a timestamp representing the server\r\n                  time in UTC when this report was updated.\r\n                format: date-time\r\n                type: string\r\n            required:\r\n            - artifact\r\n            - scanner\r\n            - secrets\r\n            - summary\r\n            - updateTimestamp\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: infraassessmentreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: InfraAssessmentReport\r\n    listKind: InfraAssessmentReportList\r\n    plural: infraassessmentreports\r\n    shortNames:\r\n    - infraassessment\r\n    - infraassessments\r\n    singular: infraassessmentreport\r\n  scope: Namespaced\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of the infra assessment scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of failed checks with critical severity\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with high severity\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with medium severity\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with low severity\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: InfraAssessmentReport is a specification for the InfraAssessmentReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            properties:\r\n              checks:\r\n                description: Checks provides results of conducting audit steps.\r\n                items:\r\n                  description: Check provides the result of conducting a single audit\r\n                    step.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    checkID:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    messages:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    remediation:\r\n                      description: Remediation provides description or links to external\r\n                        resources to remediate failing check.\r\n                      type: string\r\n                    scope:\r\n                      description: Scope indicates the section of config that was\r\n                        audited.\r\n                      properties:\r\n                        type:\r\n                          description: Type indicates type of this scope, e.g. Container,\r\n                            ConfigMapKey or JSONPath.\r\n                          type: string\r\n                        value:\r\n                          description: Value indicates value of this scope that depends\r\n                            on Type, e.g. container name, ConfigMap key or JSONPath\r\n                            expression\r\n                          type: string\r\n                      required:\r\n                      - type\r\n                      - value\r\n                      type: object\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      type: string\r\n                    success:\r\n                      type: boolean\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - checkID\r\n                  - severity\r\n                  - success\r\n                  type: object\r\n                type: array\r\n              scanner:\r\n                description: Scanner is the spec for a scanner generating a security\r\n                  assessment report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: InfraAssessmentSummary counts failed checks by severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of failed checks with\r\n                      critical severity.\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of failed checks with high\r\n                      severity.\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of failed check with low severity.\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of failed checks with medium\r\n                      severity.\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n            required:\r\n            - checks\r\n            - scanner\r\n            - summary\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: rbacassessmentreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: RbacAssessmentReport\r\n    listKind: RbacAssessmentReportList\r\n    plural: rbacassessmentreports\r\n    shortNames:\r\n    - rbacassessment\r\n    - rbacassessments\r\n    singular: rbacassessmentreport\r\n  scope: Namespaced\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of the rbac assessment scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of failed checks with critical severity\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with high severity\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with medium severity\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of failed checks with low severity\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: RbacAssessmentReport is a specification for the RbacAssessmentReport\r\n          resource.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            properties:\r\n              checks:\r\n                description: Checks provides results of conducting audit steps.\r\n                items:\r\n                  description: Check provides the result of conducting a single audit\r\n                    step.\r\n                  properties:\r\n                    category:\r\n                      type: string\r\n                    checkID:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    messages:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    remediation:\r\n                      description: Remediation provides description or links to external\r\n                        resources to remediate failing check.\r\n                      type: string\r\n                    scope:\r\n                      description: Scope indicates the section of config that was\r\n                        audited.\r\n                      properties:\r\n                        type:\r\n                          description: Type indicates type of this scope, e.g. Container,\r\n                            ConfigMapKey or JSONPath.\r\n                          type: string\r\n                        value:\r\n                          description: Value indicates value of this scope that depends\r\n                            on Type, e.g. container name, ConfigMap key or JSONPath\r\n                            expression\r\n                          type: string\r\n                      required:\r\n                      - type\r\n                      - value\r\n                      type: object\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      type: string\r\n                    success:\r\n                      type: boolean\r\n                    title:\r\n                      type: string\r\n                  required:\r\n                  - checkID\r\n                  - severity\r\n                  - success\r\n                  type: object\r\n                type: array\r\n              scanner:\r\n                description: Scanner is the spec for a scanner generating a security\r\n                  assessment report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: RbacAssessmentSummary counts failed checks by severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of failed checks with\r\n                      critical severity.\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of failed checks with high\r\n                      severity.\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of failed check with low severity.\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of failed checks with medium\r\n                      severity.\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                type: object\r\n            required:\r\n            - checks\r\n            - scanner\r\n            - summary\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: sbomreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: SbomReport\r\n    listKind: SbomReportList\r\n    plural: sbomreports\r\n    shortNames:\r\n    - sbom\r\n    - sboms\r\n    singular: sbomreport\r\n  scope: Namespaced\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of image repository\r\n      jsonPath: .report.artifact.repository\r\n      name: Repository\r\n      type: string\r\n    - description: The name of image tag\r\n      jsonPath: .report.artifact.tag\r\n      name: Tag\r\n      type: string\r\n    - description: The name of the sbom generation scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of dependencies in bom\r\n      jsonPath: .report.summary.componentsCount\r\n      name: Components\r\n      priority: 1\r\n      type: integer\r\n    - description: The the number of components in bom\r\n      jsonPath: .report.summary.dependenciesCount\r\n      name: Dependencies\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: SbomReport summarizes components and dependencies found in container\r\n          image\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            description: Report is the actual sbom report data.\r\n            properties:\r\n              artifact:\r\n                description: |-\r\n                  Artifact represents a standalone, executable package of software that includes everything needed to\r\n                  run an application.\r\n                properties:\r\n                  digest:\r\n                    description: Digest is a unique and immutable identifier of an\r\n                      Artifact.\r\n                    type: string\r\n                  mimeType:\r\n                    description: MimeType represents a type and format of an Artifact.\r\n                    type: string\r\n                  repository:\r\n                    description: Repository is the name of the repository in the Artifact\r\n                      registry.\r\n                    type: string\r\n                  tag:\r\n                    description: Tag is a mutable, human-readable string used to identify\r\n                      an Artifact.\r\n                    type: string\r\n                type: object\r\n              components:\r\n                description: Bom is artifact bill of materials.\r\n                properties:\r\n                  bomFormat:\r\n                    type: string\r\n                  components:\r\n                    items:\r\n                      properties:\r\n                        bom-ref:\r\n                          type: string\r\n                        group:\r\n                          type: string\r\n                        hashes:\r\n                          items:\r\n                            properties:\r\n                              alg:\r\n                                type: string\r\n                              content:\r\n                                type: string\r\n                            type: object\r\n                          type: array\r\n                        licenses:\r\n                          items:\r\n                            properties:\r\n                              expression:\r\n                                type: string\r\n                              license:\r\n                                properties:\r\n                                  id:\r\n                                    type: string\r\n                                  name:\r\n                                    type: string\r\n                                  url:\r\n                                    type: string\r\n                                type: object\r\n                            type: object\r\n                          type: array\r\n                        name:\r\n                          type: string\r\n                        properties:\r\n                          items:\r\n                            properties:\r\n                              name:\r\n                                type: string\r\n                              value:\r\n                                type: string\r\n                            type: object\r\n                          type: array\r\n                        purl:\r\n                          type: string\r\n                        supplier:\r\n                          properties:\r\n                            contact:\r\n                              items:\r\n                                properties:\r\n                                  email:\r\n                                    type: string\r\n                                  name:\r\n                                    type: string\r\n                                  phone:\r\n                                    type: string\r\n                                type: object\r\n                              type: array\r\n                            name:\r\n                              type: string\r\n                            url:\r\n                              items:\r\n                                type: string\r\n                              type: array\r\n                          type: object\r\n                        type:\r\n                          type: string\r\n                        version:\r\n                          type: string\r\n                      type: object\r\n                    type: array\r\n                  dependencies:\r\n                    items:\r\n                      properties:\r\n                        dependsOn:\r\n                          items:\r\n                            type: string\r\n                          type: array\r\n                        ref:\r\n                          type: string\r\n                      type: object\r\n                    type: array\r\n                  metadata:\r\n                    properties:\r\n                      component:\r\n                        properties:\r\n                          bom-ref:\r\n                            type: string\r\n                          group:\r\n                            type: string\r\n                          hashes:\r\n                            items:\r\n                              properties:\r\n                                alg:\r\n                                  type: string\r\n                                content:\r\n                                  type: string\r\n                              type: object\r\n                            type: array\r\n                          licenses:\r\n                            items:\r\n                              properties:\r\n                                expression:\r\n                                  type: string\r\n                                license:\r\n                                  properties:\r\n                                    id:\r\n                                      type: string\r\n                                    name:\r\n                                      type: string\r\n                                    url:\r\n                                      type: string\r\n                                  type: object\r\n                              type: object\r\n                            type: array\r\n                          name:\r\n                            type: string\r\n                          properties:\r\n                            items:\r\n                              properties:\r\n                                name:\r\n                                  type: string\r\n                                value:\r\n                                  type: string\r\n                              type: object\r\n                            type: array\r\n                          purl:\r\n                            type: string\r\n                          supplier:\r\n                            properties:\r\n                              contact:\r\n                                items:\r\n                                  properties:\r\n                                    email:\r\n                                      type: string\r\n                                    name:\r\n                                      type: string\r\n                                    phone:\r\n                                      type: string\r\n                                  type: object\r\n                                type: array\r\n                              name:\r\n                                type: string\r\n                              url:\r\n                                items:\r\n                                  type: string\r\n                                type: array\r\n                            type: object\r\n                          type:\r\n                            type: string\r\n                          version:\r\n                            type: string\r\n                        type: object\r\n                      timestamp:\r\n                        type: string\r\n                      tools:\r\n                        properties:\r\n                          components:\r\n                            items:\r\n                              properties:\r\n                                bom-ref:\r\n                                  type: string\r\n                                group:\r\n                                  type: string\r\n                                hashes:\r\n                                  items:\r\n                                    properties:\r\n                                      alg:\r\n                                        type: string\r\n                                      content:\r\n                                        type: string\r\n                                    type: object\r\n                                  type: array\r\n                                licenses:\r\n                                  items:\r\n                                    properties:\r\n                                      expression:\r\n                                        type: string\r\n                                      license:\r\n                                        properties:\r\n                                          id:\r\n                                            type: string\r\n                                          name:\r\n                                            type: string\r\n                                          url:\r\n                                            type: string\r\n                                        type: object\r\n                                    type: object\r\n                                  type: array\r\n                                name:\r\n                                  type: string\r\n                                properties:\r\n                                  items:\r\n                                    properties:\r\n                                      name:\r\n                                        type: string\r\n                                      value:\r\n                                        type: string\r\n                                    type: object\r\n                                  type: array\r\n                                purl:\r\n                                  type: string\r\n                                supplier:\r\n                                  properties:\r\n                                    contact:\r\n                                      items:\r\n                                        properties:\r\n                                          email:\r\n                                            type: string\r\n                                          name:\r\n                                            type: string\r\n                                          phone:\r\n                                            type: string\r\n                                        type: object\r\n                                      type: array\r\n                                    name:\r\n                                      type: string\r\n                                    url:\r\n                                      items:\r\n                                        type: string\r\n                                      type: array\r\n                                  type: object\r\n                                type:\r\n                                  type: string\r\n                                version:\r\n                                  type: string\r\n                              type: object\r\n                            type: array\r\n                        type: object\r\n                    type: object\r\n                  serialNumber:\r\n                    type: string\r\n                  specVersion:\r\n                    type: string\r\n                  version:\r\n                    type: integer\r\n                required:\r\n                - bomFormat\r\n                - specVersion\r\n                type: object\r\n              registry:\r\n                description: Registry is the registry the Artifact was pulled from.\r\n                properties:\r\n                  server:\r\n                    description: Server the FQDN of registry server.\r\n                    type: string\r\n                type: object\r\n              scanner:\r\n                description: Scanner is the scanner that generated this report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: Summary is a summary of sbom report.\r\n                properties:\r\n                  componentsCount:\r\n                    description: ComponentsCount is the number of components in bom.\r\n                    minimum: 0\r\n                    type: integer\r\n                  dependenciesCount:\r\n                    description: DependenciesCount is the number of dependencies in\r\n                      bom.\r\n                    minimum: 0\r\n                    type: integer\r\n                required:\r\n                - componentsCount\r\n                - dependenciesCount\r\n                type: object\r\n              updateTimestamp:\r\n                description: UpdateTimestamp is a timestamp representing the server\r\n                  time in UTC when this report was updated.\r\n                format: date-time\r\n                type: string\r\n            required:\r\n            - artifact\r\n            - components\r\n            - scanner\r\n            - summary\r\n            - updateTimestamp\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: apiextensions.k8s.io/v1\r\nkind: CustomResourceDefinition\r\nmetadata:\r\n  annotations:\r\n    controller-gen.kubebuilder.io/version: v0.18.0\r\n  name: vulnerabilityreports.aquasecurity.github.io\r\nspec:\r\n  group: aquasecurity.github.io\r\n  names:\r\n    kind: VulnerabilityReport\r\n    listKind: VulnerabilityReportList\r\n    plural: vulnerabilityreports\r\n    shortNames:\r\n    - vuln\r\n    - vulns\r\n    singular: vulnerabilityreport\r\n  scope: Namespaced\r\n  versions:\r\n  - additionalPrinterColumns:\r\n    - description: The name of image repository\r\n      jsonPath: .report.artifact.repository\r\n      name: Repository\r\n      type: string\r\n    - description: The name of image tag\r\n      jsonPath: .report.artifact.tag\r\n      name: Tag\r\n      type: string\r\n    - description: The name of the vulnerability scanner\r\n      jsonPath: .report.scanner.name\r\n      name: Scanner\r\n      type: string\r\n    - description: The age of the report\r\n      jsonPath: .metadata.creationTimestamp\r\n      name: Age\r\n      type: date\r\n    - description: The number of critical vulnerabilities\r\n      jsonPath: .report.summary.criticalCount\r\n      name: Critical\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of high vulnerabilities\r\n      jsonPath: .report.summary.highCount\r\n      name: High\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of medium vulnerabilities\r\n      jsonPath: .report.summary.mediumCount\r\n      name: Medium\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of low vulnerabilities\r\n      jsonPath: .report.summary.lowCount\r\n      name: Low\r\n      priority: 1\r\n      type: integer\r\n    - description: The number of unknown vulnerabilities\r\n      jsonPath: .report.summary.unknownCount\r\n      name: Unknown\r\n      priority: 1\r\n      type: integer\r\n    name: v1alpha1\r\n    schema:\r\n      openAPIV3Schema:\r\n        description: |-\r\n          VulnerabilityReport summarizes vulnerabilities in application dependencies and operating system packages\r\n          built into container images.\r\n        properties:\r\n          apiVersion:\r\n            description: |-\r\n              APIVersion defines the versioned schema of this representation of an object.\r\n              Servers should convert recognized schemas to the latest internal value, and\r\n              may reject unrecognized values.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources\r\n            type: string\r\n          kind:\r\n            description: |-\r\n              Kind is a string value representing the REST resource this object represents.\r\n              Servers may infer this from the endpoint the client submits requests to.\r\n              Cannot be updated.\r\n              In CamelCase.\r\n              More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds\r\n            type: string\r\n          metadata:\r\n            type: object\r\n          report:\r\n            description: Report is the actual vulnerability report data.\r\n            properties:\r\n              artifact:\r\n                description: |-\r\n                  Artifact represents a standalone, executable package of software that includes everything needed to\r\n                  run an application.\r\n                properties:\r\n                  digest:\r\n                    description: Digest is a unique and immutable identifier of an\r\n                      Artifact.\r\n                    type: string\r\n                  mimeType:\r\n                    description: MimeType represents a type and format of an Artifact.\r\n                    type: string\r\n                  repository:\r\n                    description: Repository is the name of the repository in the Artifact\r\n                      registry.\r\n                    type: string\r\n                  tag:\r\n                    description: Tag is a mutable, human-readable string used to identify\r\n                      an Artifact.\r\n                    type: string\r\n                type: object\r\n              os:\r\n                description: OS information of the artifact\r\n                properties:\r\n                  eosl:\r\n                    description: Eosl is true if OS version has reached end of service\r\n                      life\r\n                    type: boolean\r\n                  family:\r\n                    description: Operating System Family\r\n                    type: string\r\n                  name:\r\n                    description: Name or version of the OS\r\n                    type: string\r\n                type: object\r\n              registry:\r\n                description: Registry is the registry the Artifact was pulled from.\r\n                properties:\r\n                  server:\r\n                    description: Server the FQDN of registry server.\r\n                    type: string\r\n                type: object\r\n              scanner:\r\n                description: Scanner is the scanner that generated this report.\r\n                properties:\r\n                  name:\r\n                    description: Name the name of the scanner.\r\n                    type: string\r\n                  vendor:\r\n                    description: Vendor the name of the vendor providing the scanner.\r\n                    type: string\r\n                  version:\r\n                    description: Version the version of the scanner.\r\n                    type: string\r\n                required:\r\n                - name\r\n                - vendor\r\n                - version\r\n                type: object\r\n              summary:\r\n                description: Summary is a summary of Vulnerability counts grouped\r\n                  by Severity.\r\n                properties:\r\n                  criticalCount:\r\n                    description: CriticalCount is the number of vulnerabilities with\r\n                      Critical Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  highCount:\r\n                    description: HighCount is the number of vulnerabilities with High\r\n                      Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  lowCount:\r\n                    description: LowCount is the number of vulnerabilities with Low\r\n                      Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  mediumCount:\r\n                    description: MediumCount is the number of vulnerabilities with\r\n                      Medium Severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                  noneCount:\r\n                    description: NoneCount is the number of packages without any vulnerability.\r\n                    minimum: 0\r\n                    type: integer\r\n                  unknownCount:\r\n                    description: UnknownCount is the number of vulnerabilities with\r\n                      unknown severity.\r\n                    minimum: 0\r\n                    type: integer\r\n                required:\r\n                - criticalCount\r\n                - highCount\r\n                - lowCount\r\n                - mediumCount\r\n                - unknownCount\r\n                type: object\r\n              updateTimestamp:\r\n                description: UpdateTimestamp is a timestamp representing the server\r\n                  time in UTC when this report was updated.\r\n                format: date-time\r\n                type: string\r\n              vulnerabilities:\r\n                description: Vulnerabilities is a list of operating system (OS) or\r\n                  application software Vulnerability items found in the Artifact.\r\n                items:\r\n                  description: Vulnerability is the spec for a vulnerability record.\r\n                  properties:\r\n                    class:\r\n                      type: string\r\n                    cvss:\r\n                      additionalProperties:\r\n                        properties:\r\n                          V2Score:\r\n                            type: number\r\n                          V2Vector:\r\n                            type: string\r\n                          V3Score:\r\n                            type: number\r\n                          V3Vector:\r\n                            type: string\r\n                          V40Score:\r\n                            type: number\r\n                          V40Vector:\r\n                            type: string\r\n                        type: object\r\n                      type: object\r\n                    cvsssource:\r\n                      type: string\r\n                    description:\r\n                      type: string\r\n                    fixedVersion:\r\n                      description: FixedVersion indicates the version of the Resource\r\n                        in which this vulnerability has been fixed.\r\n                      type: string\r\n                    installedVersion:\r\n                      description: InstalledVersion indicates the installed version\r\n                        of the Resource.\r\n                      type: string\r\n                    lastModifiedDate:\r\n                      description: LastModifiedDate indicates the last date CVE has\r\n                        been modified.\r\n                      type: string\r\n                    links:\r\n                      items:\r\n                        type: string\r\n                      type: array\r\n                    packagePURL:\r\n                      type: string\r\n                    packagePath:\r\n                      type: string\r\n                    packageType:\r\n                      type: string\r\n                    primaryLink:\r\n                      type: string\r\n                    publishedDate:\r\n                      description: PublishedDate indicates the date of published CVE.\r\n                      type: string\r\n                    resource:\r\n                      description: Resource is a vulnerable package, application,\r\n                        or library.\r\n                      type: string\r\n                    score:\r\n                      type: number\r\n                    severity:\r\n                      description: Severity level of a vulnerability or a configuration\r\n                        audit check.\r\n                      enum:\r\n                      - CRITICAL\r\n                      - HIGH\r\n                      - MEDIUM\r\n                      - LOW\r\n                      - UNKNOWN\r\n                      type: string\r\n                    target:\r\n                      type: string\r\n                    title:\r\n                      type: string\r\n                    vulnerabilityID:\r\n                      description: VulnerabilityID the vulnerability identifier.\r\n                      type: string\r\n                  required:\r\n                  - fixedVersion\r\n                  - installedVersion\r\n                  - lastModifiedDate\r\n                  - publishedDate\r\n                  - resource\r\n                  - severity\r\n                  - title\r\n                  - vulnerabilityID\r\n                  type: object\r\n                type: array\r\n            required:\r\n            - artifact\r\n            - os\r\n            - scanner\r\n            - summary\r\n            - updateTimestamp\r\n            - vulnerabilities\r\n            type: object\r\n        required:\r\n        - report\r\n        type: object\r\n        x-kubernetes-preserve-unknown-fields: true\r\n    served: true\r\n    storage: true\r\n    subresources: {}\r\n---\r\napiVersion: v1\r\nkind: Namespace\r\nmetadata:\r\n  name: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\n---\r\n# Source: trivy-operator/templates/configmaps/operator.yaml\r\napiVersion: v1\r\nkind: ConfigMap\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\ndata:\r\n  nodeCollector.volumes: "[{\\"hostPath\\":{\\"path\\":\\"/var/lib/etcd\\"},\\"name\\":\\"var-lib-etcd\\"},{\\"hostPath\\":{\\"path\\":\\"/var/lib/kubelet\\"},\\"name\\":\\"var-lib-kubelet\\"},{\\"hostPath\\":{\\"path\\":\\"/var/lib/kube-scheduler\\"},\\"name\\":\\"var-lib-kube-scheduler\\"},{\\"hostPath\\":{\\"path\\":\\"/var/lib/kube-controller-manager\\"},\\"name\\":\\"var-lib-kube-controller-manager\\"},{\\"hostPath\\":{\\"path\\":\\"/etc/systemd\\"},\\"name\\":\\"etc-systemd\\"},{\\"hostPath\\":{\\"path\\":\\"/lib/systemd\\"},\\"name\\":\\"lib-systemd\\"},{\\"hostPath\\":{\\"path\\":\\"/etc/kubernetes\\"},\\"name\\":\\"etc-kubernetes\\"},{\\"hostPath\\":{\\"path\\":\\"/etc/cni/net.d/\\"},\\"name\\":\\"etc-cni-netd\\"}]"\r\n  nodeCollector.volumeMounts: "[{\\"mountPath\\":\\"/var/lib/etcd\\",\\"name\\":\\"var-lib-etcd\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/var/lib/kubelet\\",\\"name\\":\\"var-lib-kubelet\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/var/lib/kube-scheduler\\",\\"name\\":\\"var-lib-kube-scheduler\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/var/lib/kube-controller-manager\\",\\"name\\":\\"var-lib-kube-controller-manager\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/etc/systemd\\",\\"name\\":\\"etc-systemd\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/lib/systemd/\\",\\"name\\":\\"lib-systemd\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/etc/kubernetes\\",\\"name\\":\\"etc-kubernetes\\",\\"readOnly\\":true},{\\"mountPath\\":\\"/etc/cni/net.d/\\",\\"name\\":\\"etc-cni-netd\\",\\"readOnly\\":true}]"\r\n  scanJob.useGCRServiceAccount: "true"\r\n  scanJob.podTemplateContainerSecurityContext: "{\\"allowPrivilegeEscalation\\":false,\\"capabilities\\":{\\"drop\\":[\\"ALL\\"]},\\"privileged\\":false,\\"readOnlyRootFilesystem\\":true,\\"runAsUser\\":0}"\r\n  scanJob.compressLogs: "true"\r\n  vulnerabilityReports.scanner: "Trivy"\r\n  vulnerabilityReports.scanJobsInSameNamespace: "false"\r\n  configAuditReports.scanner: "Trivy"\r\n  compliance.failEntriesLimit: "10"\r\n  report.recordFailedChecksOnly: "true"\r\n  node.collector.imageRef: "ghcr.io/aquasecurity/node-collector:0.3.1"\r\n  policies.bundle.oci.ref: "mirror.gcr.io/aquasec/trivy-checks:1"\r\n  policies.bundle.insecure: "false"\r\n\r\n  node.collector.nodeSelector: "true"\r\n---\r\n# Source: trivy-operator/templates/configmaps/trivy-operator-config.yaml\r\nkind: ConfigMap\r\napiVersion: v1\r\nmetadata:\r\n  name: trivy-operator-config\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\ndata:\r\n  OPERATOR_LOG_DEV_MODE: "false"\r\n  OPERATOR_SCAN_JOB_TTL: ""\r\n  OPERATOR_SCAN_JOB_TIMEOUT: "5m"\r\n  OPERATOR_CONCURRENT_SCAN_JOBS_LIMIT: "5"\r\n  OPERATOR_CONCURRENT_NODE_COLLECTOR_LIMIT: "1"\r\n  OPERATOR_SCAN_JOB_RETRY_AFTER: "30s"\r\n  OPERATOR_BATCH_DELETE_LIMIT: "10"\r\n  OPERATOR_BATCH_DELETE_DELAY: "10s"\r\n  OPERATOR_METRICS_BIND_ADDRESS: ":8080"\r\n  OPERATOR_METRICS_FINDINGS_ENABLED: "true"\r\n  OPERATOR_METRICS_VULN_ID_ENABLED: "false"\r\n  OPERATOR_HEALTH_PROBE_BIND_ADDRESS: ":9090"\r\n  OPERATOR_PPROF_BIND_ADDRESS: ""\r\n  OPERATOR_VULNERABILITY_SCANNER_ENABLED: "true"\r\n  OPERATOR_SBOM_GENERATION_ENABLED: "true"\r\n  OPERATOR_CLUSTER_SBOM_CACHE_ENABLED: "false"\r\n  OPERATOR_VULNERABILITY_SCANNER_SCAN_ONLY_CURRENT_REVISIONS: "true"\r\n  OPERATOR_SCANNER_REPORT_TTL: "24h"\r\n  OPERATOR_CACHE_REPORT_TTL: "120h"\r\n  CONTROLLER_CACHE_SYNC_TIMEOUT: "5m"\r\n  OPERATOR_CONFIG_AUDIT_SCANNER_ENABLED: "true"\r\n  OPERATOR_RBAC_ASSESSMENT_SCANNER_ENABLED: "true"\r\n  OPERATOR_INFRA_ASSESSMENT_SCANNER_ENABLED: "true"\r\n  OPERATOR_CONFIG_AUDIT_SCANNER_SCAN_ONLY_CURRENT_REVISIONS: "true"\r\n  OPERATOR_EXPOSED_SECRET_SCANNER_ENABLED: "true"\r\n  OPERATOR_METRICS_EXPOSED_SECRET_INFO_ENABLED: "false"\r\n  OPERATOR_METRICS_CONFIG_AUDIT_INFO_ENABLED: "false"\r\n  OPERATOR_METRICS_RBAC_ASSESSMENT_INFO_ENABLED: "false"\r\n  OPERATOR_METRICS_INFRA_ASSESSMENT_INFO_ENABLED: "false"\r\n  OPERATOR_METRICS_IMAGE_INFO_ENABLED: "false"\r\n  OPERATOR_METRICS_CLUSTER_COMPLIANCE_INFO_ENABLED: "false"\r\n  OPERATOR_WEBHOOK_BROADCAST_URL: ""\r\n  OPERATOR_WEBHOOK_BROADCAST_TIMEOUT: "30s"\r\n  OPERATOR_WEBHOOK_BROADCAST_CUSTOM_HEADERS: ""\r\n  OPERATOR_SEND_DELETED_REPORTS: "false"\r\n  OPERATOR_PRIVATE_REGISTRY_SCAN_SECRETS_NAMES: "{}"\r\n  OPERATOR_ACCESS_GLOBAL_SECRETS_SERVICE_ACCOUNTS: "true"\r\n  OPERATOR_BUILT_IN_TRIVY_SERVER: "false"\r\n  TRIVY_SERVER_HEALTH_CHECK_CACHE_EXPIRATION: "10h"\r\n  OPERATOR_MERGE_RBAC_FINDING_WITH_CONFIG_AUDIT: "false"\r\n  OPERATOR_CLUSTER_COMPLIANCE_ENABLED: "true"\r\n---\r\n# Source: trivy-operator/templates/configmaps/trivy.yaml\r\napiVersion: v1\r\nkind: ConfigMap\r\nmetadata:\r\n  name: trivy-operator-trivy-config\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\ndata:\r\n  trivy.repository: "mirror.gcr.io/aquasec/trivy"\r\n  trivy.tag: "0.69.3"\r\n  trivy.imagePullPolicy: "IfNotPresent"\r\n  trivy.additionalVulnerabilityReportFields: ""\r\n  trivy.severity: "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL"\r\n  trivy.slow: "true"\r\n  trivy.skipJavaDBUpdate: "false"\r\n  trivy.includeDevDeps: "false"\r\n  trivy.imageScanCacheDir: "/tmp/trivy/.cache"\r\n  trivy.filesystemScanCacheDir: "/var/trivyoperator/trivy-db"\r\n  trivy.dbRepository: "mirror.gcr.io/aquasec/trivy-db"\r\n  trivy.javaDbRepository: "mirror.gcr.io/aquasec/trivy-java-db"\r\n  trivy.command: "filesystem"\r\n  trivy.ignoreUnfixed: "true"\r\n  trivy.sbomSources: ""\r\n  trivy.dbRepositoryInsecure: "false"\r\n  trivy.useBuiltinRegoPolicies: "false"\r\n  trivy.useEmbeddedRegoPolicies: "true"\r\n  trivy.supportedConfigAuditKinds: "Workload,Service,Role,ClusterRole,NetworkPolicy,Ingress,LimitRange,ResourceQuota"\r\n  trivy.timeout: "5m0s"\r\n  trivy.mode: "Standalone"\r\n  trivy.resources.requests.cpu: "100m"\r\n  trivy.resources.requests.memory: "100M"\r\n  trivy.resources.limits.cpu: "500m"\r\n  trivy.resources.limits.memory: "500M"\r\n---\r\n# Source: trivy-operator/templates/secrets/operator.yaml\r\napiVersion: v1\r\nkind: Secret\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\ndata:\r\n---\r\n# Source: trivy-operator/templates/secrets/trivy.yaml\r\napiVersion: v1\r\nkind: Secret\r\nmetadata:\r\n  name: trivy-operator-trivy-config\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\ndata:\r\n---\r\n# Source: trivy-operator/templates/deployment.yaml\r\napiVersion: apps/v1\r\nkind: Deployment\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nspec:\r\n  replicas: 1\r\n  strategy:\r\n    type: Recreate\r\n  selector:\r\n    matchLabels:\r\n      app.kubernetes.io/name: trivy-operator\r\n      app.kubernetes.io/instance: trivy-operator\r\n  template:\r\n    metadata:\r\n      annotations:\r\n        checksum/config: 31d4af34c2224d1fca88bd22b862d4a01ff98f99897807ca53944b3115c34420\r\n      labels:\r\n        app.kubernetes.io/name: trivy-operator\r\n        app.kubernetes.io/instance: trivy-operator\r\n    spec:\r\n      serviceAccountName: trivy-operator\r\n      automountServiceAccountToken: true\r\n      containers:\r\n        - name: "trivy-operator"\r\n          image: "mirror.gcr.io/aquasec/trivy-operator:0.30.1"\r\n          imagePullPolicy: IfNotPresent\r\n          env:\r\n            - name: OPERATOR_NAMESPACE\r\n              value: trivy-system\r\n            - name: OPERATOR_TARGET_NAMESPACES\r\n              value: ""\r\n            - name: OPERATOR_EXCLUDE_NAMESPACES\r\n              value: ""\r\n            - name: OPERATOR_TARGET_WORKLOADS\r\n              value: "pod,replicaset,replicationcontroller,statefulset,daemonset,cronjob,job"\r\n            - name: OPERATOR_SERVICE_ACCOUNT\r\n              value: "trivy-operator"\r\n          envFrom:\r\n            - configMapRef:\r\n                name: trivy-operator-config\r\n          ports:\r\n            - name: metrics\r\n              containerPort: 8080\r\n            - name: probes\r\n              containerPort: 9090\r\n          readinessProbe:\r\n            httpGet:\r\n              path: /readyz/\r\n              port: probes\r\n            initialDelaySeconds: 5\r\n            periodSeconds: 10\r\n            successThreshold: 1\r\n            failureThreshold: 3\r\n          livenessProbe:\r\n            httpGet:\r\n              path: /healthz/\r\n              port: probes\r\n            initialDelaySeconds: 5\r\n            periodSeconds: 10\r\n            successThreshold: 1\r\n            failureThreshold: 10\r\n          securityContext:\r\n            allowPrivilegeEscalation: false\r\n            capabilities:\r\n              drop:\r\n              - ALL\r\n            privileged: false\r\n            readOnlyRootFilesystem: true\r\n          volumeMounts:\r\n            - mountPath: /tmp\r\n              name: cache-policies\r\n              readOnly: false\r\n      volumes:\r\n        - emptyDir: {}\r\n          name: cache-policies\r\n---\r\n# Source: trivy-operator/templates/monitor/service.yaml\r\napiVersion: v1\r\nkind: Service\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nspec:\r\n  clusterIP: None\r\n  ports:\r\n    - name: metrics\r\n      port: 80\r\n      targetPort: metrics\r\n      protocol: TCP\r\n      appProtocol: TCP\r\n  selector:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n  type: ClusterIP\r\n---\r\n# Source: trivy-operator/templates/rbac/clusterrole.yaml\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: ClusterRole\r\nmetadata:\r\n  name: trivy-operator\r\nrules:\r\n- apiGroups:\r\n  - ""\r\n  resources:\r\n  - configmaps\r\n  - limitranges\r\n  - nodes\r\n  - pods\r\n  - replicationcontrollers\r\n  - resourcequotas\r\n  - services\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - ""\r\n  resources:\r\n  - namespaces\r\n  verbs:\r\n  - get\r\n- apiGroups:\r\n  - ""\r\n  resources:\r\n  - pods/log\r\n  verbs:\r\n  - get\r\n  - list\r\n- apiGroups:\r\n  - apiextensions.k8s.io\r\n  resources:\r\n  - customresourcedefinitions\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - apps\r\n  resources:\r\n  - daemonsets\r\n  - deployments\r\n  - replicasets\r\n  - statefulsets\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - apps.openshift.io\r\n  resources:\r\n  - deploymentconfigs\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - aquasecurity.github.io\r\n  resources:\r\n  - clustercompliancedetailreports\r\n  - clustercompliancereports\r\n  - clusterconfigauditreports\r\n  - clusterinfraassessmentreports\r\n  - clusterrbacassessmentreports\r\n  - clustersbomreports\r\n  - clustervulnerabilityreports\r\n  - configauditreports\r\n  - exposedsecretreports\r\n  - infraassessmentreports\r\n  - rbacassessmentreports\r\n  - sbomreports\r\n  - vulnerabilityreports\r\n  verbs:\r\n  - create\r\n  - delete\r\n  - get\r\n  - list\r\n  - patch\r\n  - update\r\n  - watch\r\n- apiGroups:\r\n  - aquasecurity.github.io\r\n  resources:\r\n  - clustercompliancereports/status\r\n  verbs:\r\n  - get\r\n  - patch\r\n  - update\r\n- apiGroups:\r\n  - batch\r\n  resources:\r\n  - cronjobs\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - batch\r\n  resources:\r\n  - jobs\r\n  verbs:\r\n  - create\r\n  - delete\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - networking.k8s.io\r\n  resources:\r\n  - ingresses\r\n  - networkpolicies\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - rbac.authorization.k8s.io\r\n  resources:\r\n  - clusterrolebindings\r\n  - clusterroles\r\n  - rolebindings\r\n  - roles\r\n  verbs:\r\n  - get\r\n  - list\r\n  - watch\r\n- apiGroups:\r\n  - ""\r\n  resources:\r\n  - secrets\r\n  verbs:\r\n  - create\r\n  - get\r\n  - update\r\n- apiGroups:\r\n  - ""\r\n  resources:\r\n  - serviceaccounts\r\n  verbs:\r\n  - get\r\n- apiGroups:\r\n    - ""\r\n  resources:\r\n    - nodes/proxy\r\n  verbs:\r\n    - get\r\n---\r\n# Source: trivy-operator/templates/rbac/clusterrolebinding.yaml\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: ClusterRoleBinding\r\nmetadata:\r\n  name: trivy-operator\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nroleRef:\r\n  apiGroup: rbac.authorization.k8s.io\r\n  kind: ClusterRole\r\n  name: trivy-operator\r\nsubjects:\r\n  - kind: ServiceAccount\r\n    name: trivy-operator\r\n    namespace: trivy-system\r\n---\r\n# Source: trivy-operator/templates/rbac/leader-election-role.yaml\r\n# permissions to do leader election.\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: Role\r\nmetadata:\r\n  name: trivy-operator-leader-election\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nrules:\r\n  - apiGroups:\r\n      - coordination.k8s.io\r\n    resources:\r\n      - leases\r\n    verbs:\r\n      - create\r\n      - get\r\n      - update\r\n  - apiGroups:\r\n      - ""\r\n    resources:\r\n      - events\r\n    verbs:\r\n      - create\r\n---\r\n# Source: trivy-operator/templates/rbac/leader-election-rolebinding.yaml\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: RoleBinding\r\nmetadata:\r\n  name: trivy-operator-leader-election\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nroleRef:\r\n  apiGroup: rbac.authorization.k8s.io\r\n  kind: Role\r\n  name: trivy-operator-leader-election\r\nsubjects:\r\n  - kind: ServiceAccount\r\n    name: trivy-operator\r\n    namespace: trivy-system\r\n---\r\n# Source: trivy-operator/templates/rbac/role.yaml\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: Role\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nrules:\r\n  - apiGroups:\r\n      - ""\r\n    resources:\r\n      - configmaps\r\n    verbs:\r\n      - create\r\n      - get\r\n      - list\r\n      - watch\r\n  - apiGroups:\r\n      - ""\r\n    resources:\r\n      - secrets\r\n    verbs:\r\n      - create\r\n      - get\r\n      - delete\r\n      - update\r\n---\r\n# Source: trivy-operator/templates/rbac/rolebinding.yaml\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: RoleBinding\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\nroleRef:\r\n  apiGroup: rbac.authorization.k8s.io\r\n  kind: Role\r\n  name: trivy-operator\r\nsubjects:\r\n  - kind: ServiceAccount\r\n    name: trivy-operator\r\n    namespace: trivy-system\r\n---\r\n# Source: trivy-operator/templates/rbac/view-configauditreports-clusterrole.yaml\r\n# permissions for end users to view configauditreports\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: ClusterRole\r\nmetadata:\r\n  name: aggregate-config-audit-reports-view\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\n    rbac.authorization.k8s.io/aggregate-to-view: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-edit: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-admin: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-cluster-reader: "true"\r\nrules:\r\n  - apiGroups:\r\n      - aquasecurity.github.io\r\n    resources:\r\n      - configauditreports\r\n    verbs:\r\n      - get\r\n      - list\r\n      - watch\r\n---\r\n# Source: trivy-operator/templates/rbac/view-exposedsecretreports-clusterrole.yaml\r\n# permissions for end users to view exposedsecretreports\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: ClusterRole\r\nmetadata:\r\n  name: aggregate-exposed-secret-reports-view\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\n    rbac.authorization.k8s.io/aggregate-to-view: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-edit: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-admin: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-cluster-reader: "true"\r\nrules:\r\n  - apiGroups:\r\n      - aquasecurity.github.io\r\n    resources:\r\n      - exposedsecretreports\r\n    verbs:\r\n      - get\r\n      - list\r\n      - watch\r\n---\r\n# Source: trivy-operator/templates/rbac/view-vulnerabilityreports-clusterrole.yaml\r\n# permissions for end users to view vulnerabilityreports\r\napiVersion: rbac.authorization.k8s.io/v1\r\nkind: ClusterRole\r\nmetadata:\r\n  name: aggregate-vulnerability-reports-view\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl\r\n    rbac.authorization.k8s.io/aggregate-to-view: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-edit: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-admin: "true"\r\n    rbac.authorization.k8s.io/aggregate-to-cluster-reader: "true"\r\nrules:\r\n  - apiGroups:\r\n      - aquasecurity.github.io\r\n    resources:\r\n      - vulnerabilityreports\r\n    verbs:\r\n      - get\r\n      - list\r\n      - watch\r\n---\r\n# Source: trivy-operator/templates/serviceaccount.yaml\r\napiVersion: v1\r\nkind: ServiceAccount\r\nmetadata:\r\n  name: trivy-operator\r\n  namespace: trivy-system\r\n  labels:\r\n    app.kubernetes.io/name: trivy-operator\r\n    app.kubernetes.io/instance: trivy-operator\r\n    app.kubernetes.io/version: "0.30.1"\r\n    app.kubernetes.io/managed-by: kubectl';

// src/back/index.ts
var TRIVY_API_VERSION = "v1alpha1";
var TRIVY_API_GROUP = "aquasecurity.github.io";
var TRIVY_API_VULN_PLURAL = "vulnerabilityreports";
var TRIVY_API_AUDIT_PLURAL = "configauditreports";
var TRIVY_API_SBOM_PLURAL = "sbomreports";
var TRIVY_API_EXPOSED_PLURAL = "exposedsecretreports";
var TrivyChannel = class {
  channelId = "trivy";
  requirements = { storage: false, providers: [] };
  clusterInfo;
  backChannelObject;
  informers = /* @__PURE__ */ new Map();
  webSockets = [];
  constructor(clusterInfo, backChannelObject) {
    this.clusterInfo = clusterInfo;
    this.backChannelObject = backChannelObject;
  }
  getChannelData = () => ({
    id: this.channelId,
    routable: false,
    pauseable: false,
    modifiable: false,
    reconnectable: false,
    metrics: false,
    sources: [import_kwirth_common.EClusterType.KUBERNETES],
    endpoints: [{ name: "operator", methods: ["GET"], requiresAccessKey: true }],
    websocket: false,
    cluster: false,
    resourced: true
  });
  getChannelScopeLevel = (scope) => ["", "trivy$workload", "trivy$kubernetes", "cluster"].indexOf(scope);
  startChannel = async () => {
  };
  processProviderEvent(_providerId, _obj) {
  }
  async endpointRequest(endpoint, req, res) {
    console.log(`[trivy] endpointRequest: ${endpoint} ${req.method} ${req.url}`);
    const action = req.query["action"];
    switch (action) {
      case "install":
        try {
          await (0, import_kwirth_common_back.applyAllResources)(trivy_operator_0_30_1_default, this.clusterInfo);
          res.status(200).send("ok");
        } catch (err) {
          res.status(500).send(err);
        }
        break;
      case "remove":
        try {
          await (0, import_kwirth_common_back.deleteAllResources)(trivy_operator_0_30_1_default, this.clusterInfo);
          res.status(200).send();
        } catch (err) {
          res.status(500).send(err);
        }
        break;
      case "status":
        try {
          const cm = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: "trivy-operator-trivy-config", namespace: "trivy-system" });
          if (!cm.data) {
            res.status(404).send(`No Trivy config map exist on namespace 'trivy-system', Trivy seems not to be installed.`);
          } else {
            res.status(200).send(`Installed [${cm.data["trivy.command"]}, 0.30.1]`);
          }
        } catch (err) {
          res.status(200).send(`Not installed (Trivy configMap not found in 'trivy-system')`);
        }
        break;
      default:
        res.status(500).send("Invalid action " + action);
    }
  }
  async websocketRequest(_newWebSocket) {
  }
  containsAsset = (webSocket, podNamespace, podName, containerName) => {
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    return socket?.instances.some((i) => i.assets.some((a) => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName)) ?? false;
  };
  containsInstance = (instanceId) => this.webSockets.some((s) => s.instances.find((i) => i.instanceId === instanceId));
  processCommand = async (webSocket, instanceMessage) => {
    if (instanceMessage.flow === import_kwirth_common.EInstanceMessageFlow.IMMEDIATE) return false;
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    if (!socket) return false;
    const instance = socket.instances.find((i) => i.instanceId === instanceMessage.instance);
    if (!instance) {
      this.sendSignalMessage(webSocket, instanceMessage.action, import_kwirth_common.EInstanceMessageFlow.RESPONSE, import_kwirth_common.ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`);
      return false;
    }
    const resp = await this.executeCommand(instanceMessage, instance);
    if (resp) webSocket.send(JSON.stringify(resp));
    return Boolean(resp);
  };
  addObject = async (webSocket, instanceConfig, podNamespace, podName, containerName) => {
    let socket = this.webSockets.find((s) => s.ws === webSocket);
    if (!socket) {
      const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] });
      socket = this.webSockets[len - 1];
    }
    let instance = socket.instances.find((i) => i.instanceId === instanceConfig.instance);
    if (!instance) {
      instance = { accessKey: (0, import_kwirth_common.accessKeyDeserialize)(instanceConfig.accessKey), instanceId: instanceConfig.instance, assets: [], maxCritical: 0, maxHigh: 0, maxMedium: 0, maxLow: 0 };
      socket.instances.push(instance);
    }
    const ic = instanceConfig.data;
    if (ic) {
      instance.maxCritical = ic.maxCritical;
      instance.maxHigh = ic.maxHigh;
      instance.maxMedium = ic.maxMedium;
      instance.maxLow = ic.maxLow;
    }
    const asset = { podNamespace, podName, containerName };
    const sendIfKnown = (result) => {
      if (!result.known) return;
      const payload = {
        msgtype: "trivymessageresponse",
        msgsubtype: "add",
        id: "",
        namespace: asset.podNamespace,
        group: "",
        pod: asset.podName,
        container: asset.containerName,
        action: import_kwirth_common.EInstanceMessageAction.NONE,
        flow: import_kwirth_common.EInstanceMessageFlow.UNSOLICITED,
        type: import_kwirth_common.EInstanceMessageType.DATA,
        channel: import_kwirth_common.EInstanceMessageChannel.TRIVY,
        instance: instance.instanceId
      };
      payload.data = result;
      webSocket.send(JSON.stringify(payload));
    };
    sendIfKnown(await this.getAssetVulnReport(instance, asset));
    sendIfKnown(await this.getAssetAuditReport(instance, asset));
    sendIfKnown(await this.getAssetSbomReport(instance, asset));
    sendIfKnown(await this.getAssetExposedReport(instance, asset));
    instance.assets.push(asset);
    for (const plural of [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL]) {
      if (!this.informers.has(plural)) {
        const informer = this.createInformer(webSocket, instance, plural);
        this.informers.set(plural, informer);
        informer.start();
      }
    }
    return true;
  };
  deleteObject = async (webSocket, instanceConfig, podNamespace, podName, containerName) => {
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    const instance = socket?.instances.find((i) => i.instanceId === instanceConfig.instance);
    if (instance) instance.assets = instance.assets.filter((a) => !(a.podNamespace === podNamespace && a.podName === podName && (containerName === "" || a.containerName === containerName)));
    return true;
  };
  pauseContinueInstance(_webSocket, _instanceConfig, _action) {
  }
  modifyInstance(_webSocket, _instanceConfig) {
  }
  stopInstance = (webSocket, instanceConfig) => {
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    if (socket?.instances.find((i) => i.instanceId === instanceConfig.instance)) {
      this.removeInstance(webSocket, instanceConfig.instance);
      this.sendSignalMessage(webSocket, import_kwirth_common.EInstanceMessageAction.STOP, import_kwirth_common.EInstanceMessageFlow.RESPONSE, import_kwirth_common.ESignalMessageLevel.INFO, instanceConfig.instance, "Trivy instance stopped");
    } else {
      this.sendSignalMessage(webSocket, import_kwirth_common.EInstanceMessageAction.STOP, import_kwirth_common.EInstanceMessageFlow.RESPONSE, import_kwirth_common.ESignalMessageLevel.ERROR, instanceConfig.instance, `Trivy instance not found`);
    }
  };
  removeInstance = (webSocket, instanceId) => {
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    if (socket) {
      const pos = socket.instances.findIndex((t) => t.instanceId === instanceId);
      if (pos >= 0) socket.instances.splice(pos, 1);
    }
  };
  containsConnection = (webSocket) => Boolean(this.webSockets.find((s) => s.ws === webSocket));
  removeConnection = (webSocket) => {
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    if (socket) {
      for (const id of socket.instances.map((i) => i.instanceId)) this.removeInstance(webSocket, id);
      const pos = this.webSockets.findIndex((s) => s.ws === webSocket);
      this.webSockets.splice(pos, 1);
    }
  };
  refreshConnection = (webSocket) => {
    const socket = this.webSockets.find((s) => s.ws === webSocket);
    if (socket) {
      socket.lastRefresh = Date.now();
      return true;
    }
    return false;
  };
  updateConnection = (_newWebSocket, _instanceId) => false;
  // ─── PRIVATE ────────────────────────────────────────────────────────────────
  sendSignalMessage = (ws, action, flow, level, instanceId, text) => {
    ws.send(JSON.stringify({ action, flow, channel: import_kwirth_common.EInstanceMessageChannel.TRIVY, instance: instanceId, type: import_kwirth_common.EInstanceMessageType.SIGNAL, text, level }));
  };
  checkScopes = (instance, scope) => {
    const resources = (0, import_kwirth_common.parseResources)(instance.accessKey.resources);
    const requiredLevel = this.getChannelScopeLevel(scope);
    return resources.some((r) => r.scopes.split(",").some((sc) => this.getChannelScopeLevel(sc) >= requiredLevel));
  };
  createInformer = (webSocket, instance, plural) => {
    const path = `/apis/${TRIVY_API_GROUP}/${TRIVY_API_VERSION}/${plural}`;
    const listFunction = () => this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, plural }).then((res) => {
      const typedBody = res;
      return typedBody;
    });
    const informer = (0, import_client_node.makeInformer)(this.clusterInfo.kubeConfig, path, listFunction);
    informer.on("add", (obj) => this.processInformerEvent(webSocket, instance, plural, "add", obj));
    informer.on("update", (obj) => this.processInformerEvent(webSocket, instance, plural, "update", obj));
    informer.on("delete", (obj) => this.processInformerEvent(webSocket, instance, plural, "delete", obj));
    informer.on("error", (err) => {
      try {
        console.error("[trivy] Informer error:", err);
        if (err["HTTP-Code"] === "404" || err.statusCode === 404)
          console.log("[trivy] CRD not found, informer will not restart");
        else
          setTimeout(() => {
            informer.start();
            console.log("[trivy] Informer restarted");
          }, 5e3);
      } catch (e) {
        console.error("[trivy] Error managing informer error:", e);
      }
    });
    return informer;
  };
  async getReport(plural, instance, asset, withContainer) {
    try {
      const crdName = await this.getCrdName(asset.podNamespace, asset.podName, withContainer ? asset.containerName : void 0);
      if (crdName) {
        try {
          const crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.podNamespace, plural, name: crdName });
          return { resource: plural, known: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, report: crdObject.report } };
        } catch (err) {
          return { resource: plural, unknown: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, statusCode: 0, statusMessage: err.toString() } };
        }
      }
      return { resource: plural, unknown: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, statusCode: 999, statusMessage: "Cannot get CRD name" } };
    } catch (err) {
      console.error("[trivy] Caught error:", err);
      return { resource: plural, unknown: { container: asset.containerName, name: asset.podName, namespace: asset.podNamespace, statusCode: 999, statusMessage: err } };
    }
  }
  getAssetVulnReport = (instance, asset) => this.getReport(TRIVY_API_VULN_PLURAL, instance, asset, true);
  getAssetAuditReport = (instance, asset) => this.getReport(TRIVY_API_AUDIT_PLURAL, instance, asset, false);
  getAssetSbomReport = (instance, asset) => this.getReport(TRIVY_API_SBOM_PLURAL, instance, asset, true);
  getAssetExposedReport = (instance, asset) => this.getReport(TRIVY_API_EXPOSED_PLURAL, instance, asset, true);
  removeReport = async (plural, trivyMessage) => {
    const crdName = await this.getCrdName(trivyMessage.namespace, trivyMessage.pod, trivyMessage.container);
    if (crdName) {
      try {
        await this.clusterInfo.crdApi.deleteNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: trivyMessage.namespace, plural, name: crdName });
        return void 0;
      } catch (err) {
        return `Error removing ${plural}: ` + err;
      }
    }
    return `Couldn't get CRD name`;
  };
  executeCommand = async (trivyMessage, instance) => {
    const resp = {
      msgtype: "trivymessageresponse",
      id: "",
      namespace: trivyMessage.namespace,
      group: trivyMessage.group,
      pod: trivyMessage.pod,
      container: trivyMessage.container,
      action: trivyMessage.action,
      flow: import_kwirth_common.EInstanceMessageFlow.RESPONSE,
      type: import_kwirth_common.EInstanceMessageType.DATA,
      channel: trivyMessage.channel,
      instance: trivyMessage.instance
    };
    if (trivyMessage.command === "rescan" /* RESCAN */) {
      const errors = await Promise.all([TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL].map((p) => this.removeReport(p, trivyMessage)));
      const err = errors.find(Boolean);
      if (err) resp.data = err;
    }
    return resp;
  };
  processInformerEvent = async (webSocket, instance, plural, event, obj) => {
    const asset = instance.assets.find(
      (a) => "Pod" === obj.metadata.labels["trivy-operator.resource.kind"] && a.containerName === obj.metadata.labels["trivy-operator.container.name"] && a.podNamespace === obj.metadata.labels["trivy-operator.resource.namespace"] && a.podName.startsWith(obj.metadata.labels["trivy-operator.resource.name"])
    );
    if (!asset) return;
    const payload = {
      msgtype: "trivymessageresponse",
      msgsubtype: event,
      id: "",
      namespace: asset.podNamespace,
      group: "",
      pod: asset.podName,
      container: asset.containerName,
      action: import_kwirth_common.EInstanceMessageAction.NONE,
      flow: import_kwirth_common.EInstanceMessageFlow.UNSOLICITED,
      type: import_kwirth_common.EInstanceMessageType.DATA,
      channel: import_kwirth_common.EInstanceMessageChannel.TRIVY,
      instance: instance.instanceId
    };
    if (event === "add" || event === "update") {
      switch (plural) {
        case TRIVY_API_VULN_PLURAL:
          payload.data = await this.getAssetVulnReport(instance, asset);
          break;
        case TRIVY_API_AUDIT_PLURAL:
          payload.data = await this.getAssetAuditReport(instance, asset);
          break;
        case TRIVY_API_SBOM_PLURAL:
          payload.data = await this.getAssetSbomReport(instance, asset);
          break;
        case TRIVY_API_EXPOSED_PLURAL:
          payload.data = await this.getAssetExposedReport(instance, asset);
          break;
      }
    } else {
      payload.data = { known: { name: asset.podName, namespace: asset.podNamespace, container: asset.containerName, report: void 0 } };
    }
    payload.data.resource = plural;
    webSocket.send(JSON.stringify(payload));
  };
  getCrdName = async (namespace, podName, containerName) => {
    try {
      const podData = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace });
      const ctrl = podData.metadata?.ownerReferences?.find((or) => or.controller);
      if (ctrl) return `${ctrl.kind.toLowerCase()}-${ctrl.name}${containerName ? "-" + containerName : ""}`;
      return `pod-${podName}${containerName ? "-" + containerName : ""}`;
    } catch (err) {
      console.error("[trivy] Cannot get CRD name:", err);
      return void 0;
    }
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TrivyChannel
});
