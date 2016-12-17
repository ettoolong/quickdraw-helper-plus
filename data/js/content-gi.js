let checkImage = setInterval(() => {
  let imgs = Array.from(document.querySelectorAll('img.rg_ic.rg_i'));
  if(imgs.length>5) {
    clearInterval(checkImage);
    let index = Math.floor((Math.random() * 5));
    self.port.emit("getImage", {text: self.options.text, img: imgs[index].src });
  }
}, 100);
