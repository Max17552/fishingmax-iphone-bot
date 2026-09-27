const { chromium } = require("playwright");
const fs = require("fs");

const POLL_INTERVAL_MS = 500;
const PAGE_LOAD_TIMEOUT = 30000;
const CHECKOUT_TIMEOUT = 30000;

function validateProductUrl(productUrl) {
  if (!productUrl) {
    throw new Error("PRODUCT_URL が指定されていません。");
  }

  const url = new URL(productUrl);

  if (url.protocol !== "https:") {
    throw new Error("HTTPSのURLを指定してください。");
  }

  if (url.hostname !== "www.fishingmax-webshop.jp") {
    throw new Error(`許可されていないホストです: ${url.hostname}`);
  }

  if (!url.pathname.startsWith("/products/")) {
    throw new Error("Fishingmaxの商品ページURLを指定してください。");
  }

  return url;
}

async function readTargetOption(page, desiredTime) {
  const timeSelect = page.locator(
    'select[name="options[出船時間]"]'
  );

  if (await timeSelect.count() !== 1) {
    throw new Error("出船時間SELECTを特定できませんでした。");
  }

  const options = await timeSelect.locator("option").evaluateAll(
    (elements) =>
      elements.map((element) => ({
        text: element.textContent.trim(),
        value: element.value,
        disabled: element.disabled
      }))
  );

  const target = options.find(
    (option) => option.value === desiredTime
  );

  return {
    timeSelect,
    options,
    target
  };
}

async function waitForStock(page, desiredTime) {
  let attempt = 0;

  while (true) {
    attempt++;

    const {
      timeSelect,
      options,
      target
    } = await readTargetOption(page, desiredTime);

    if (!target) {
      throw new Error(
        `指定時間「${desiredTime}」が商品ページに存在しません。`
      );
    }

    const available = target.text.includes("在庫：○");

    console.log(
      `[監視 ${attempt}] ${target.text}`
    );

    if (available && !target.disabled) {
      console.log(
        `指定時間 ${desiredTime} の在庫を検出しました。`
      );

      return {
        timeSelect,
        options,
        target
      };
    }

    await page.waitForTimeout(POLL_INTERVAL_MS);

    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT
    });

    await page.waitForTimeout(100);
  }
}

async function submitCartForm(page) {
  const result = await page.evaluate(() => {
    const form =
      document.querySelector(
        'form[action*="/cart/add"]'
      ) ||
      document.querySelector(
        'form[id*="product-form"]'
      );

    if (!form) {
      return {
        ok: false,
        reason: "cart form not found"
      };
    }

    const submitButton =
      form.querySelector(
        'button[name="add"]'
      ) ||
      form.querySelector(
        'button[type="submit"]'
      );

    if (!submitButton) {
      return {
        ok: false,
        reason: "submit button not found"
      };
    }

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit(submitButton);
    } else {
      submitButton.click();
    }

    return {
      ok: true,
      formAction: form.action,
      variantId:
        form.querySelector(
          'input[name="id"]'
        )?.value || null
    };
  });

  if (!result.ok) {
    throw new Error(
      `カートフォーム送信に失敗しました: ${result.reason}`
    );
  }

  return result;
}

async function findCheckoutButton(page) {
  const candidates = [
    'a[href*="/checkout"]',
    'button[name="checkout"]',
    'input[name="checkout"]',
    'button:has-text("ご購入手続きへ")',
    'a:has-text("ご購入手続きへ")',
    'button:has-text("購入手続きへ")',
    'a:has-text("購入手続きへ")',
    'button:has-text("チェックアウト")',
    'a:has-text("チェックアウト")'
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();

    if (await locator.count() > 0) {
      const visible = await locator.isVisible().catch(() => false);

      if (visible) {
        return locator;
      }
    }
  }

  return null;
}

async function waitForCheckoutButton(page) {
  const deadline = Date.now() + CHECKOUT_TIMEOUT;

  while (Date.now() < deadline) {
    const button = await findCheckoutButton(page);

    if (button) {
      return button;
    }

    await page.waitForTimeout(200);
  }

  return null;
}

async function findFinalOrderButton(page) {
  const selectors = [
    'button[name="commit"]',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("注文を確定する")',
    'button:has-text("注文を確定")',
    'button:has-text("購入を確定する")',
    'button:has-text("購入を確定")',
    'button:has-text("注文する")',
    'button:has-text("購入する")',
    'input[value*="注文を確定"]',
    'input[value*="購入を確定"]'
  ];

  const results = [];

  for (const selector of selectors) {
    const locator = page.locator(selector);

    const count = await locator.count();

    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);

      if (!(await item.isVisible().catch(() => false))) {
        continue;
      }

      const text = (
        await item.innerText().catch(() => "")
      ).trim();

      const value = await item
        .getAttribute("value")
        .catch(() => null);

      const combined = `${text} ${value || ""}`;

      if (
        /注文を確定|購入を確定|注文する|購入する/.test(
          combined
        )
      ) {
        results.push({
          locator: item,
          text: combined
        });
      }
    }
  }

  return results;
}

async function main() {
  const productUrl = process.env.PRODUCT_URL;
  const desiredTime =
    process.env.DESIRED_TIME || "11時00分";
  const desiredQuantity =
    process.env.DESIRED_QUANTITY || "1";

  let browser = null;
  let context = null;
  let page = null;

  try {
    validateProductUrl(productUrl);

    const quantity = Number(desiredQuantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(
        "DESIRED_QUANTITY は1以上の整数にしてください。"
      );
    }

    console.log("========================================");
    console.log("Fishingmax 完成系予約エンジン");
    console.log("========================================");
    console.log(`商品URL: ${productUrl}`);
    console.log(`指定時間: ${desiredTime}`);
    console.log(`数量: ${quantity}`);
    console.log(`監視間隔: ${POLL_INTERVAL_MS}ms`);
    console.log("");

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

    // ------------------------------------------------------------
    // 商品ページ
    // ------------------------------------------------------------

    await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT
    });

    await page.waitForTimeout(1500);

    console.log(`現在URL: ${page.url()}`);
    console.log(`タイトル: ${await page.title()}`);
    console.log("");

    // ------------------------------------------------------------
    // 在庫監視
    // ------------------------------------------------------------

    const stockResult =
      await waitForStock(
        page,
        desiredTime
      );

    const timeSelect =
      stockResult.timeSelect;

    // ------------------------------------------------------------
    // 時間選択
    // ------------------------------------------------------------

    await timeSelect.selectOption({
      value: desiredTime
    });

    await page.waitForTimeout(300);

    const selectedTime =
      await timeSelect.inputValue();

    if (selectedTime !== desiredTime) {
      throw new Error(
        `時間選択に失敗しました。期待=${desiredTime} 実際=${selectedTime}`
      );
    }

    console.log(
      `時間選択成功: ${selectedTime}`
    );

    // ------------------------------------------------------------
    // 数量
    // ------------------------------------------------------------

    const quantityInput =
      page.locator(
        "#Quantity-template--27235294904633__main"
      );

    if (await quantityInput.count() !== 1) {
      throw new Error(
        "数量入力欄を特定できませんでした。"
      );
    }

    await quantityInput.fill(
      String(quantity)
    );

    const selectedQuantity =
      await quantityInput.inputValue();

    if (
      selectedQuantity !==
      String(quantity)
    ) {
      throw new Error(
        `数量設定に失敗しました。期待=${quantity} 実際=${selectedQuantity}`
      );
    }

    console.log(
      `数量設定成功: ${selectedQuantity}`
    );

    // ------------------------------------------------------------
    // バリアントID
    // ------------------------------------------------------------

    const variantInput =
      page.locator(
        'input.product-variant-id[name="id"]'
      );

    let variantId = null;

    if (
      await variantInput.count() > 0
    ) {
      variantId =
        await variantInput
          .first()
          .inputValue();
    }

    console.log(
      `バリアントID: ${variantId}`
    );

    // ------------------------------------------------------------
    // カート投入
    // ------------------------------------------------------------

    console.log("");
    console.log(
      "カート投入を実行します。"
    );

    const cartResult =
      await submitCartForm(page);

    console.log(
      `カートフォーム: ${cartResult.formAction}`
    );

    await page.waitForTimeout(1800);

    // ------------------------------------------------------------
    // カート投入確認
    // ------------------------------------------------------------

    const cartText =
      await page.locator("body").innerText();

    const cartScreenshot =
      "fishingmax-cart-added.png";

    await page.screenshot({
      path: cartScreenshot,
      fullPage: true
    });

    console.log(
      `カート投入後URL: ${page.url()}`
    );

    // ------------------------------------------------------------
    // ご購入手続きへ
    // ------------------------------------------------------------

    console.log("");
    console.log(
      "「ご購入手続きへ」を検索します。"
    );

    const checkoutButton =
      await waitForCheckoutButton(page);

    if (!checkoutButton) {
      throw new Error(
        "「ご購入手続きへ」ボタンを検出できませんでした。"
      );
    }

    const checkoutText =
      (
        await checkoutButton
          .innerText()
          .catch(() => "")
      ).trim();

    const checkoutHref =
      await checkoutButton
        .getAttribute("href")
        .catch(() => null);

    console.log(
      `購入手続きボタン検出: ${checkoutText}`
    );

    if (checkoutHref) {
      console.log(
        `購入手続きURL: ${checkoutHref}`
      );
    }

    // ------------------------------------------------------------
    // 購入手続きへ進む
    // ------------------------------------------------------------

    console.log("");
    console.log(
      "購入手続き画面へ進みます。"
    );

    await checkoutButton.click({
      force: true,
      timeout: 10000
    });

    await page.waitForTimeout(2500);

    console.log(
      `購入手続き後URL: ${page.url()}`
    );

    // ------------------------------------------------------------
    // 最終注文ボタン検出
    // ------------------------------------------------------------

    console.log("");
    console.log(
      "最終注文ボタンを検索します。"
    );

    const finalButtons =
      await findFinalOrderButton(page);

    const finalButtonInfo =
      finalButtons.map(
        (item) => item.text
      );

    // ------------------------------------------------------------
    // 最終状態保存
    // ------------------------------------------------------------

    const finalText =
      await page.locator("body").innerText();

    await page.screenshot({
      path: "fishingmax-checkout-final.png",
      fullPage: true
    });

    fs.writeFileSync(
      "fishingmax-final-result.json",
      JSON.stringify(
        {
          completed: true,

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

          cart: {
            submitted: true,
            urlAfterCart: page.url()
          },

          checkout: {
            reached: true,
            checkoutButtonText: checkoutText,
            checkoutHref,
            finalOrderButtonsDetected:
              finalButtonInfo
          },

          finalState: {
            url: page.url(),
            pageTextPreview:
              finalText.substring(0, 20000)
          },

          safety: {
            finalOrderButtonClicked: false,
            orderConfirmed: false
          }
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      "fishingmax-page-text.txt",
      finalText,
      "utf8"
    );

    console.log("");
    console.log("========================================");
    console.log("予約処理を購入確定直前まで完了");
    console.log("========================================");
    console.log("");

    console.log(
      `指定時間: ${selectedTime}`
    );

    console.log(
      `数量: ${selectedQuantity}`
    );

    console.log(
      `バリアントID: ${variantId}`
    );

    console.log(
      `最終URL: ${page.url()}`
    );

    console.log(
      `最終注文ボタン検出数: ${finalButtons.length}`
    );

    console.log("");
    console.log(
      "【停止】注文確定ボタンはクリックしていません。"
    );

    console.log("");
    console.log(
      "この時点で処理を終了します。"
    );

  } catch (error) {

    fs.writeFileSync(
      "fishingmax-error.txt",
      [
        "Fishingmax Reservation Engine Error",
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
        fs.writeFileSync(
          "fishingmax-error-page-text.txt",
          await page.locator("body").innerText(),
          "utf8"
        );
      } catch {}

      try {
        await page.screenshot({
          path: "fishingmax-error-page.png",
          fullPage: true
        });
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
  console.error("Fishingmax予約エンジンでエラー");
  console.error("========================================");
  console.error(error.message);
  console.error("");
  process.exit(1);
});
