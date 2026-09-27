const { chromium } = require("playwright");
const fs = require("fs");

const ENGINE_VERSION = "2026-09-27-cart-v7";

const POLL_INTERVAL_MS = 500;
const PAGE_LOAD_TIMEOUT = 30000;
const CART_VERIFY_TIMEOUT = 10000;

function validateProductUrl(productUrl) {
  if (!productUrl) {
    throw new Error("PRODUCT_URL が指定されていません。");
  }

  const url = new URL(productUrl);

  if (url.protocol !== "https:") {
    throw new Error("HTTPSのURLを指定してください。");
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

async function getTargetTime(page, desiredTime) {
  const select = page.locator(
    'select[name="options[出船時間]"]'
  );

  if (await select.count() !== 1) {
    throw new Error(
      "出船時間SELECTを特定できませんでした。"
    );
  }

  const options = await select.locator("option").evaluateAll(
    elements =>
      elements.map(element => ({
        text: element.textContent.trim(),
        value: element.value,
        disabled: element.disabled
      }))
  );

  const target = options.find(
    option => option.value === desiredTime
  );

  if (!target) {
    throw new Error(
      `指定時間「${desiredTime}」が見つかりません。`
    );
  }

  return {
    select,
    target
  };
}

async function waitForStock(page, desiredTime) {
  let attempt = 0;

  while (true) {
    attempt++;

    const result =
      await getTargetTime(
        page,
        desiredTime
      );

    console.log(
      `[監視 ${attempt}] ${result.target.text}`
    );

    if (
      result.target.text.includes("在庫：○") &&
      !result.target.disabled
    ) {
      console.log(
        `指定時間 ${desiredTime} の在庫を検出しました。`
      );

      return result;
    }

    await page.waitForTimeout(
      POLL_INTERVAL_MS
    );

    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT
    });

    await page.waitForTimeout(100);
  }
}

async function addToCartByApi(
  page,
  variantId,
  quantity
) {
  console.log("");
  console.log(
    "ShopifyカートAPIへ商品を追加します。"
  );

  const result =
    await page.evaluate(
      async ({ variantId, quantity }) => {
        const response =
          await fetch("/cart/add.js", {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "Accept":
                "application/json"
            },
            body:
              new URLSearchParams({
                id: String(variantId),
                quantity: String(quantity)
              }).toString()
          });

        const text =
          await response.text();

        let data = null;

        try {
          data = JSON.parse(text);
        } catch {
          data = {
            raw: text
          };
        }

        return {
          ok: response.ok,
          status: response.status,
          data
        };
      },
      {
        variantId,
        quantity
      }
    );

  console.log(
    `カートAPI HTTPステータス: ${result.status}`
  );

  if (!result.ok) {
    throw new Error(
      `カートAPIによる商品追加に失敗しました。HTTP ${result.status}`
    );
  }

  console.log(
    "カートAPIへの追加リクエストが成功しました。"
  );

  return result;
}

async function getCart(page) {
  return await page.evaluate(
    async () => {
      const response =
        await fetch("/cart.js", {
          method: "GET",
          headers: {
            "Accept": "application/json"
          },
          cache: "no-store"
        });

      const text =
        await response.text();

      let data = null;

      try {
        data = JSON.parse(text);
      } catch {
        data = {
          raw: text
        };
      }

      return {
        ok: response.ok,
        status: response.status,
        data
      };
    }
  );
}

async function verifyCart(
  page,
  variantId,
  quantity
) {
  const deadline =
    Date.now() + CART_VERIFY_TIMEOUT;

  while (Date.now() < deadline) {
    const cart =
      await getCart(page);

    if (!cart.ok) {
      throw new Error(
        `カート確認APIに失敗しました。HTTP ${cart.status}`
      );
    }

    const items =
      Array.isArray(cart.data.items)
        ? cart.data.items
        : [];

    const matchingItems =
      items.filter(
        item =>
          String(item.variant_id) ===
          String(variantId)
      );

    const totalQuantity =
      matchingItems.reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0),
        0
      );

    console.log(
      `カート確認: 商品数=${items.length} / 対象商品の数量=${totalQuantity}`
    );

    if (
      totalQuantity >= quantity
    ) {
      console.log(
        "カートへの実追加を確認しました。"
      );

      return cart.data;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    "カートAPIは成功しましたが、/cart.jsで対象商品を確認できませんでした。"
  );
}

async function findFinalOrderButton(page) {
  /*
   * Fishingmaxの実際のチェックアウト画面では
   *
   *     ご注文完了
   *
   * と表示されるため、この文字列を最優先で検索する。
   *
   * 重要:
   * この関数は検出だけを行い、
   * ボタンをクリックしない。
   */

  const textSelectors = [
    'button:has-text("ご注文完了")',
    'button:has-text("注文を確定")',
    'button:has-text("注文を確定する")',
    'button:has-text("購入を確定")',
    'button:has-text("購入を確定する")',
    'button:has-text("注文する")',
    'button:has-text("購入する")',

    'input[value*="ご注文完了"]',
    'input[value*="注文を確定"]',
    'input[value*="購入を確定"]',
    'input[value*="注文する"]',
    'input[value*="購入する"]'
  ];

  for (const selector of textSelectors) {
    const locator =
      page.locator(selector);

    const count =
      await locator.count();

    for (let i = 0; i < count; i++) {
      const candidate =
        locator.nth(i);

      if (
        await candidate.isVisible()
          .catch(() => false)
      ) {
        return {
          locator: candidate,
          selector,
          text:
            (
              await candidate.innerText()
                .catch(() => "")
            ).trim(),
          value:
            await candidate
              .getAttribute("value")
              .catch(() => null)
        };
      }
    }
  }

  /*
   * Shopifyのチェックアウトでは
   * button以外の要素がクリック可能な場合もあるため、
   * 画面上のテキストから最終ボタンを探索する。
   */

  const candidates =
    await page.locator(
      "button, [role='button'], input[type='submit']"
    ).evaluateAll(
      elements =>
        elements.map(
          (element, index) => ({
            index,
            tag:
              element.tagName,
            id:
              element.id || "",
            name:
              element.getAttribute("name") || "",
            type:
              element.getAttribute("type") || "",
            text:
              (
                element.innerText ||
                element.value ||
                ""
              ).trim(),
            visible:
              !!(
                element.offsetWidth ||
                element.offsetHeight ||
                element.getClientRects().length
              ),
            disabled:
              !!element.disabled
          })
        )
    );

  const finalCandidate =
    candidates.find(
      candidate =>
        candidate.visible &&
        !candidate.disabled &&
        /ご注文完了|注文を確定|注文する|購入を確定|購入する/
          .test(candidate.text)
    );

  if (finalCandidate) {
    return {
      locator:
        page.locator(
          "button, [role='button'], input[type='submit']"
        ).nth(
          finalCandidate.index
        ),
      selector:
        "generic-final-order-button",
      text:
        finalCandidate.text,
      value:
        null
    };
  }

  return null;
}

async function main() {
  const productUrl =
    process.env.PRODUCT_URL;

  const desiredTime =
    process.env.DESIRED_TIME ||
    "11時00分";

  const desiredQuantity =
    process.env.DESIRED_QUANTITY ||
    "1";

  let browser = null;
  let context = null;
  let page = null;

  try {
    validateProductUrl(productUrl);

    const quantity =
      Number(desiredQuantity);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error(
        "DESIRED_QUANTITY は1以上の整数にしてください。"
      );
    }

    console.log(
      "========================================"
    );

    console.log(
      "Fishingmax 完成系予約エンジン"
    );

    console.log(
      `ENGINE VERSION: ${ENGINE_VERSION}`
    );

    console.log(
      "========================================"
    );

    console.log(
      `商品URL: ${productUrl}`
    );

    console.log(
      `指定時間: ${desiredTime}`
    );

    console.log(
      `数量: ${quantity}`
    );

    console.log("");

    browser =
      await chromium.launch({
        headless: true
      });

    context =
      await browser.newContext({
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        viewport: {
          width: 390,
          height: 844
        }
      });

    page =
      await context.newPage();

    await page.goto(
      productUrl,
      {
        waitUntil: "domcontentloaded",
        timeout: PAGE_LOAD_TIMEOUT
      }
    );

    await page.waitForTimeout(1500);

    console.log(
      `現在URL: ${page.url()}`
    );

    console.log(
      `タイトル: ${await page.title()}`
    );

    console.log("");

    const stock =
      await waitForStock(
        page,
        desiredTime
      );

    const timeSelect =
      stock.select;

    await timeSelect.selectOption({
      value: desiredTime
    });

    await page.waitForTimeout(300);

    const selectedTime =
      await timeSelect.inputValue();

    if (
      selectedTime !== desiredTime
    ) {
      throw new Error(
        `時間選択に失敗しました。期待=${desiredTime} 実際=${selectedTime}`
      );
    }

    console.log(
      `時間選択成功: ${selectedTime}`
    );

    const quantityInput =
      page.locator(
        "#Quantity-template--27235294904633__main"
      );

    if (
      await quantityInput.count() !== 1
    ) {
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

    if (!variantId) {
      throw new Error(
        "バリアントIDを取得できませんでした。"
      );
    }

    console.log(
      `バリアントID: ${variantId}`
    );

    await addToCartByApi(
      page,
      variantId,
      quantity
    );

    console.log("");

    console.log(
      "カートへの実追加を検証します。"
    );

    const verifiedCart =
      await verifyCart(
        page,
        variantId,
        quantity
      );

    fs.writeFileSync(
      "fishingmax-cart-verified.json",
      JSON.stringify(
        {
          engineVersion:
            ENGINE_VERSION,
          verified: true,
          variantId,
          quantity,
          items:
            verifiedCart.items || [],
          itemCount:
            verifiedCart.item_count,
          total:
            verifiedCart.total_price
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(
      "カート内容の検証に成功しました。"
    );

    console.log("");

    const origin =
      new URL(productUrl).origin;

    console.log(
      "カートページへ移動します。"
    );

    await page.goto(
      `${origin}/cart`,
      {
        waitUntil: "domcontentloaded",
        timeout: PAGE_LOAD_TIMEOUT
      }
    );

    await page.waitForTimeout(1000);

    console.log(
      `カートページURL: ${page.url()}`
    );

    const cartPageText =
      await page.locator(
        "body"
      ).innerText();

    fs.writeFileSync(
      "fishingmax-cart-page-text.txt",
      cartPageText,
      "utf8"
    );

    await page.screenshot({
      path:
        "fishingmax-cart-page.png",
      fullPage: true
    });

    console.log(
      `カートページ商品表示: ${
        cartPageText.includes("岸和田渡船")
          ? "確認"
          : "未確認"
      }`
    );

    console.log("");

    const checkoutButton =
      await page.locator(
        'button:has-text("ご購入手続きへ"), ' +
        'button:has-text("購入手続きへ"), ' +
        'button:has-text("チェックアウト"), ' +
        'input[value*="ご購入手続きへ"], ' +
        'input[value*="購入手続きへ"], ' +
        'a[href*="/checkout"]'
      ).filter({
        visible: true
      }).first();

    if (
      await checkoutButton.count() === 0
    ) {
      throw new Error(
        "カートページで「ご購入手続きへ」ボタンを検出できませんでした。"
      );
    }

    const checkoutText =
      (
        await checkoutButton
          .innerText()
          .catch(() => "")
      ).trim();

    console.log(
      `購入手続きボタン検出: ${checkoutText}`
    );

    console.log("");

    console.log(
      "購入手続き画面へ進みます。"
    );

    await checkoutButton.click({
      force: true,
      timeout: 10000
    });

    await page.waitForTimeout(4000);

    const checkoutUrl =
      page.url();

    console.log(
      `購入手続き後URL: ${checkoutUrl}`
    );

    console.log("");

    console.log(
      "最終注文ボタンを検索します。"
    );

    const finalButton =
      await findFinalOrderButton(
        page
      );

    const finalText =
      await page.locator(
        "body"
      ).innerText();

    await page.screenshot({
      path:
        "fishingmax-checkout-final.png",
      fullPage: true
    });

    if (!finalButton) {
      throw new Error(
        "チェックアウト画面には到達しましたが、「ご注文完了」ボタンを検出できませんでした。"
      );
    }

    console.log(
      `最終注文ボタン検出: ${finalButton.text || finalButton.value || "検出成功"}`
    );

    fs.writeFileSync(
      "fishingmax-final-result.json",
      JSON.stringify(
        {
          engineVersion:
            ENGINE_VERSION,

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
            verified: true,
            itemCount:
              verifiedCart.item_count,
            url:
              `${origin}/cart`
          },

          checkout: {
            reached: true,
            buttonText:
              checkoutText,
            url:
              checkoutUrl
          },

          finalOrder: {
            detected: true,
            buttonText:
              finalButton.text,
            buttonValue:
              finalButton.value,
            selector:
              finalButton.selector
          },

          safety: {
            finalOrderButtonClicked:
              false,
            orderConfirmed:
              false
          },

          pageTextPreview:
            finalText.substring(
              0,
              20000
            )
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

    console.log(
      "========================================"
    );

    console.log(
      "完成系テスト成功"
    );

    console.log(
      "========================================"
    );

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
      `最終注文ボタン: 検出成功`
    );

    console.log("");

    console.log(
      "【停止】注文確定ボタンはクリックしていません。"
    );

  } catch (error) {

    fs.writeFileSync(
      "fishingmax-error.txt",
      [
        "Fishingmax Reservation Engine Error",
        "========================================",
        "",
        `ENGINE VERSION: ${ENGINE_VERSION}`,
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
          await page.locator(
            "body"
          ).innerText(),
          "utf8"
        );
      } catch {}

      try {
        await page.screenshot({
          path:
            "fishingmax-error-page.png",
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

main().catch(error => {
  console.error("");
  console.error(
    "========================================"
  );
  console.error(
    "Fishingmax予約エンジンでエラー"
  );
  console.error(
    "========================================"
  );
  console.error(error.message);
  console.error("");
  process.exit(1);
});
