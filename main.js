const argv = require('yargs').argv;
const uuid = require('uuid');
const path = require('path');
const phantom = require('phantom');
const _ = require('lodash');
const { interval } = require('rxjs');
const { skipWhile, take } = require('rxjs/operators');

(async function () {
  const url = argv.url;
  const name = argv.name;
  await genPdf({ url, name });
})();

async function genPdf({url, name}) {
  let fileName = '';
  if (name) {
    fileName = `${name}.pdf`
  } else {
    const fileKey = uuid.v1().replace(/-/gi, '');
    fileName = `${fileKey}.pdf`;
  }
  const filePath = path.join('.', fileName);

  const resources = {};
  const instance = await phantom.create();
  const page = await instance.createPage();
  page.on("onResourceRequested", function (requestData, networkRequest) {
    resources[requestData.id] = { stage: 'start' };
  });
  page.on("onResourceReceived", function (response) {
    if (response.stage === 'end') {
      resources[response.id].stage = 'end';
    }
  })
  page.on("onResourceError", function (resourceError) {
    resources[resourceError.id].stage = 'error';
  });
  let isLoadFinished = false;
  page.on("onLoadFinished", function (status) {
    // 等待一秒开始检测资源是否加载完
    isLoadFinished = true;
  });
  await page.property("viewportSize", { width: 5000,height: 10000 });
  await page.property("paperSize", { format: 'A4', orientation: 'portrait', margin: '0.8cm' });
  await page.open(url);

  interval(100).pipe(
    skipWhile(() => !isLoadFinished),
    skipWhile(() => {
      const values = _.values(resources);
      if (values.filter(value => value.stage === 'start').length > 0) {
        return true;
      } else {
        return false;
      }
    }),
    take(1)
  ).subscribe(async () => {
    await page.render(filePath, { quality: "100" });
    await page.close();
    await instance.exit();
  });

}
