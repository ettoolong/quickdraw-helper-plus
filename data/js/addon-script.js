let self = require("sdk/self");
let data = self.data;
const {Cc, Ci} = require("chrome");
const pageMod = require("sdk/page-mod");
let pref = require("sdk/preferences/service");
const prefPath = "extensions.@quickdraw-helper.";
const {translate} = require("./google-translate");
let language = require("sdk/window/utils").getMostRecentBrowserWindow().getLocale();
let targetLanguage;

let quickdrawMod = null;
let cache = {};
let cacheList = [];
let lastText;
let imagePanel;

let { ActionButton } = require("sdk/ui/button/action");
let tabs = require("sdk/tabs");

let button = ActionButton({
  id: "quickdrawButton",
  label: "https://quickdraw.withgoogle.com",
  icon: data.url("img/icon.png"),
  onClick: state => {
    tabs.open("https://quickdraw.withgoogle.com");
  }
});

let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
let quickdraw_csp_listener = {
  observe : function(aSubject, aTopic, aData) {
    if (aTopic == "http-on-examine-response") {
      let url;

      aSubject.QueryInterface(Ci.nsIHttpChannel);
      url = aSubject.URI.spec;
      if (/https:\/\/quickdraw\.withgoogle\.com/.test(url)) {
        let csp = aSubject.getResponseHeader("content-security-policy");
        if(csp) {
          csp = "img-src 'self' data:;" + csp
          aSubject.setResponseHeader("content-security-policy", csp, false);
        }
      }
    }
  }
};

function setLanguage() {
  targetLanguage = pref.get(prefPath + "language");
  if(targetLanguage === "default") {
    targetLanguage = language;
  }
  cache = {};
  cacheList = [];
}

require("sdk/simple-prefs").on("language", function(prefName){
  setLanguage();
});

function loadPageMod () {

  quickdrawMod = pageMod.PageMod({
    include: "*.quickdraw.withgoogle.com",
    attachTo: ["existing", "top", "frame"],
    contentScriptFile: data.url("js/content-script.js"),
    onAttach: function(worker) {
    //   worker.port.on("msg", function(msg) {
    //       console.log(msg.msg);
    //   });
      worker.port.on("challengetext", function(msg) {

        if(imagePanel && lastText === msg.text) {
        } else {
          lastText = msg.text;

          imagePanel = require("sdk/panel").Panel({
            width: 0,
            height: 0,
            contentURL: "https://www.google.com/search?tbm=isch&q=" + msg.text,
            contentScriptFile: data.url("js/content-gi.js"),
            contentScriptWhen: "end",
            position: {
              top: 0,
              bottom: 0,
            },
            focus: false,
            contentScriptOptions: {
              text: msg.text
            }
          });

          imagePanel.port.on("getImage", message => {
            if(message.text === lastText) {
              lastText = '';
              worker.port.emit("setImage", {img: message.img});
              imagePanel.destroy();
              imagePanel = null;
            }
          });
        }

        if(cache[msg.text] === undefined) {
          cache[msg.text] = "";
          //call translet api
          const fromCode = "en";
          if(fromCode !== targetLanguage) {
            translate(fromCode, targetLanguage, msg.text, res => {
              cache[msg.text] = res.translation;
              cacheList.push(msg.text);
              //console.log('add to cache: ' + msg.text + ' => ' + cache[msg.text]);
              if(cacheList.length>100) {
                let oldWord = cacheList.shift();
                if(cache[oldWord]) {
                  //console.log('remove from cache: ' + oldWord + ' => ' + cache[oldWord]);
                  delete cache[oldWord];
                }
              }
              worker.port.emit("setText", {text: res.translation});
            });
          }
        }
        else if(cache[msg.text] === "") {
          //console.log("ignore");
        }
        else {
          //console.log('use cache: ' + msg.text + ' => ' + cache[msg.text]);
          worker.port.emit("setText", {text: cache[msg.text]});
        }
      });
    }
  });
}

exports.main = function() {
  observerService.addObserver(quickdraw_csp_listener, "http-on-examine-response", false);
  loadPageMod();
  setLanguage();
};

exports.onUnload = function(reason) {
  observerService.removeObserver(quickdraw_csp_listener, "http-on-examine-response", false);
  if(quickdrawMod) {
    quickdrawMod.destroy();
    quickdrawMod = null;
  }
};
