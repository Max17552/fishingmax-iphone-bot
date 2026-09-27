const { chromium } = require("playwright");
const fs = require("fs");

function validateProductUrl(productUrl) {
  if (!productUrl) {
    throw new Error("PRODUCT_URL が指定されていません。");
  }

  let url;

  try {
    url = new URL(productUrl);
  } catch {
    throw new Error("PRODUCT_URL が正しいURLではありません。");
  }

  if (url.protocol !== "https:") {
    throw new Error("Fishingmaxの商品URLはHTTPSで指定してください。");
  }

  if (url.hostname !== "www.fishingmax-webshop.jp") {
    throw new Error(
      `許可されていないホストです: ${url.hostname}`
    );
  }

  if (!url.pathname.startsWith("/products/")) {
    throw new Error(
      "Fishingmaxの商品ページURLを指定してください。"
    );
  }

  return url;
}

async function main() {
  const productUrl = process.env.PRODUCT_URL;
  const desiredTime = process.env.DESIRED_TIME || "11時00分";
  const desiredQuantity = process.env.DESIRED_QUANTITY || "1";

  let browser = null;
  let context = null;
  let page = null;

  try {
    console.log("========================================");
    console.log("Fishingmax カート投入テスト");
    console.log("========================================");
    console.log("");

    console.log(`商品URL: ${productUrl}`);
    console.log(`指定時間: ${desiredTime}`);
    console.log(`指定数量: ${desiredQuantity}`);
    console.log("");

    validateProductUrl(productUrl);

    const quantity = Number(desiredQuantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(
        "DESIRED_QUANTITY は1以上の整数にしてください。"
      );
    }

    browser = await chromium.launch({
      headless: true
    });

    context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: {
        width: 390,
        height: 844
      }
    });

    page = await context.newPage();

    console.log("商品ページへアクセスします。");

    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    console.log(
      `HTTPステータス: ${response ? response.status() : "不明"}`
    );
    console.log(`ページタイトル: ${await page.title()}`);
    console.log(`現在のURL: ${page.url()}`);
    console.log("");

    const timeSelect = page.locator(
      'select[name="options[出船時間]"]'
    );

    if (await timeSelect.count() !== 1) {
      throw new Error(
        "出船時間のSELECTを1つ特定できませんでした。"
      );
    }

    const options = await timeSelect.locator("option").evaluateAll(
      (elements) =>
        elements.map((element) => ({
          text: element.textContent.trim(),
          value: element.value,
          disabled: element.disabled
        }))
    );

    console.log("---------- 出船時間 ----------");

    options.forEach((option) => {
      console.log(
        `text="${option.text}" value="${option.value}" disabled=${option.disabled}`
      );
    });

    console.log("");

    const target = options.find(
      (option) => option.value === desiredTime
    );

    if (!target) {
      throw new Error(
        `指定時間「${desiredTime}」が見つかりません。`
      );
    }

    console.log(`指定時間の表示: ${target.text}`);

    if (!target.text.includes("在庫：○")) {
      throw new Error(
        `指定時間「${desiredTime}」は現在「${target.text}」です。`
      );
    }

    console.log("指定時間は在庫ありです。");
    console.log("");

    await timeSelect.selectOption({
      value: desiredTime
    });

    await page.waitForTimeout(1000);

    const selectedTime = await timeSelect.inputValue();

    if (selectedTime !== desiredTime) {
      throw new Error(
        `時間選択に失敗しました。期待=${desiredTime} 実際=${selectedTime}`
      );
    }

    console.log(`時間選択成功: ${selectedTime}`);

    const quantityInput = page.locator(
      "#Quantity-template--27235294904633__main"
    );

    if (await quantityInput.count() !== 1) {
      throw new Error(
        "数量入力欄を特定できませんでした。"
      );
    }

    await quantityInput.fill(String(quantity));

    const selectedQuantity = await quantityInput.inputValue();

    if (selectedQuantity !== String(quantity)) {
      throw new Error(
        `数量設定に失敗しました。期待=${quantity} 実際=${selectedQuantity}`
      );
    }

    console.log(`数量設定成功: ${selectedQuantity}`);
    console.log("");

    const variantInput = page.locator(
      'input.product-variant-id[name="id"]'
    );

    let variantId = null;

    if (await variantInput.count() > 0) {
      variantId = await variantInput.first().inputValue();
    }

    console.log(`バリアントID: ${variantId}`);
    console.log("");

    const cartButton = page.locator(
      "#ProductSubmitButton-template--27235294904633__main"
    );

    if (await cartButton.count() !== 1) {
      throw new Error(
        "カートボタンを特定できませんでした。"
      );
    }

    if (await cartButton.isDisabled()) {
      throw new Error(
        "カートボタンが無効になっています。"
      );
    }

    console.log("カートボタンを確認しました。");
    console.log("");

    console.log("ZenMarket等のオーバーレイを確認します。");

    const overlayInfo = await page.evaluate(() => {
      const modal = document.querySelector("#zl5F8304A2-modal");

      return {
        zenMarketModalExists: !!modal,
        zenMarketModalVisible:
          !!modal &&
          getComputedStyle(modal).display !== "none" &&
          getComputedStyle(modal).visibility !== "hidden"
      };
    });

    console.log(
      `ZenMarketモーダル存在: ${overlayInfo.zenMarketModalExists}`
    );

    console.log(
      `ZenMarketモーダル表示中: ${overlayInfo.zenMarketModalVisible}`
    );

    console.log("");

    console.log("カートボタンを実行します。");

    await cartButton.scrollIntoViewIfNeeded();

    await cartButton.click({
      force: true,
      timeout: 10000
    });

    console.log("カート投入操作を実行しました。");

    await page.waitForTimeout(3000);

    console.log("");
    console.log(`カート投入後URL: ${page.url()}`);

    const bodyText = await page.locator("body").innerText();

    const cartLinks = await page.locator(
      'a[href*="/cart"]'
    ).count();

    const checkoutLinks = await page.locator(
      'a[href*="/checkout"]'
    ).count();

    const relevantElements = await page.locator(
      'a[href*="/cart"], a[href*="/checkout"], button, input[type="submit"]'
    ).evaluateAll((elements) =>
      elements
        .map((element) => ({
          tag: element.tagName,
          text: (
            element.innerText ||
            element.value ||
            ""
          ).trim(),
          href: element.href || ""
        }))
        .filter((item) =>
          /カート|購入|チェックアウト|注文|checkout/i.test(
            `${item.text} ${item.href}`
          )
        )
        .slice(0, 50)
    );

    fs.writeFileSync(
      "fishingmax-cart-test.json",
      JSON.stringify(
        {
          testType: "Fishingmax カート投入テスト",
          checkedAt: new Date().toISOString(),

          productUrl,

          requested: {
            time: desiredTime,
            quantity
          },

          actual: {
            time: selectedTime,
            quantity: selectedQuantity,
            variantId
          },

          overlay: overlayInfo,

          afterCart: {
            url: page.url(),
            cartLinks,
            checkoutLinks,
            relevantElements,
            bodyTextPreview: bodyText.substring(0, 15000)
          },

          safety:
            "カート投入まで実行。注文確定操作は実行していません。"
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      "fishingmax-page-text.txt",
      bodyText,
      "utf8"
    );

    await page.screenshot({
      path: "fishingmax-cart-test.png",
      fullPage: true
    });

    console.log("");
    console.log("========================================");
    console.log("カート投入テスト完了");
    console.log("========================================");
    console.log("");

    console.log(`時間: ${selectedTime}`);
    console.log(`数量: ${selectedQuantity}`);
    console.log(`バリアントID: ${variantId}`);
    console.log(`カート投入後URL: ${page.url()}`);
    console.log(`Cartリンク数: ${cartLinks}`);
    console.log(`Checkoutリンク数: ${checkoutLinks}`);
    console.log("");

    console.log("注文確定は実行していません。");

  } catch (error) {

    fs.writeFileSync(
      "fishingmax-error.txt",
      [
        "Fishingmax Cart Test Error",
        "========================================",
        "",
        `日時: ${new Date().toISOString()}`,
        "",
        "エラー:",
        error.message,
        "",
        "Stack:",
        error.stack || ""
      ].join("\n"),
      "utf8"
    );

    if (page) {
      try {
        fs.writeFileSync(
          "fishingmax-error-page-url.txt",
          page.url(),
          "utf8"
        );
      } catch {}

      try {
        await page.screenshot({
          path: "fishingmax-error-page.png",
          fullPage: true
        });
      } catch {}

      try {
        fs.writeFileSync(
          "fishingmax-error-page-text.txt",
          await page.locator("body").innerText(),
          "utf8"
        );
      } catch {}
    }

    throw error;

  } finally {

    if (context) {
      await context.close();
    }

    if (browser) {
      await browser.close();
    }

  }
}

main().catch((error) => {
  console.error("");
  console.error("========================================");
  console.error("カート投入テストでエラーが発生しました");
  console.error("========================================");
  console.error(error.message);
  console.error("");

  process.exit(1);
});
