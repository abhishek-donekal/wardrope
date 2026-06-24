// End-to-end live payment test via Puppeteer.
// Drives the actual UI on whatsinmywardrobe.com/buy-points, fills Square iframe,
// clicks Pay, captures result.
import puppeteer from "puppeteer";

const BACKEND = "https://backend-gamma-gules-79.vercel.app";
const SITE = "https://whatsinmywardrobe.com";
const EMAIL = "appreview@wardrope.com";
const PASS = "AppReview2026!";

async function setToken(page, token) {
  // AsyncStorage on web is backed by window.localStorage with JSON-stringified values.
  await page.evaluate((tok) => {
    localStorage.setItem("wardrobe_auth_token", JSON.stringify(tok));
  }, token);
}

async function typeInFrameField(page, frameSrcMatch, selector, value) {
  // Find the right frame and type into it.
  const frames = page.frames();
  const frame = frames.find((f) => f.url().includes(frameSrcMatch));
  if (!frame) throw new Error(`Frame not found: ${frameSrcMatch}`);
  await frame.waitForSelector(selector, { visible: true, timeout: 15000 });
  await frame.type(selector, value, { delay: 50 });
}

(async () => {
  // 1) Login via API to get JWT
  const r = await fetch(`${BACKEND}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const { token, user } = await r.json();
  if (!token) throw new Error("Login failed");
  console.log(`Logged in user ${user.user_id}, points before: ${user.points}`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });

  // 2) Hit the site, then write token to IndexedDB (same origin as site)
  await page.goto(SITE + "/buy-points", { waitUntil: "networkidle2", timeout: 60000 });
  await setToken(page, token);
  await page.reload({ waitUntil: "networkidle2" });

  // 3) Wait for $0.99 button + click it to open modal
  await page.waitForFunction(() => document.body.innerText.includes("$0.99"), { timeout: 30000 });
  const clicked = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("div,span")).find(
      (el) => el.textContent.trim() === "Starter" && el.childElementCount === 0
    );
    if (!t) return false;
    const ev = new MouseEvent("click", { bubbles: true });
    t.dispatchEvent(ev);
    return true;
  });
  console.log("Starter click:", clicked);

  // 4) Wait for Square card iframe
  await page.waitForFunction(
    () => !!document.querySelector('#sq-card-container iframe[src*="squarecdn.com"]'),
    { timeout: 20000 }
  );
  console.log("Square iframe mounted");

  // 5) Fill card fields inside the iframe. Square Web SDK separates fields into
  // sub-iframes when using individual elements, but single-card-element uses one iframe.
  // Inputs inside that iframe: #cardNumber, #expirationDate, #cvv, #postalCode
  // Wait a beat for inner inputs to be ready.
  await new Promise((r) => setTimeout(r, 3000));
  const frames = page.frames();
  console.log("Frames:", frames.map((f) => f.url().slice(0, 80)));

  // Probe iframe DOM to find actual input selectors
  const cardFrame = frames.find((f) => f.url().includes("single-card-element"));
  if (cardFrame) {
    const inputs = await cardFrame.evaluate(() => {
      return Array.from(document.querySelectorAll("input")).map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        placeholder: i.placeholder,
        autocomplete: i.autocomplete,
      }));
    });
    console.log("Card frame inputs:", JSON.stringify(inputs));
  }

  await typeInFrameField(page, "single-card-element", 'input[autocomplete="cc-number"]', "4111 1111 1111 1111");
  await typeInFrameField(page, "single-card-element", 'input[autocomplete="cc-exp"]', "12/30");
  await typeInFrameField(page, "single-card-element", 'input[autocomplete="cc-csc"]', "111");
  await typeInFrameField(page, "single-card-element", 'input[autocomplete="postal-code"]', "94103");
  console.log("Card fields filled");

  // 6) Click Pay — walk up to the TouchableOpacity wrapper that actually has the handler
  const payClicked = await page.evaluate(() => {
    const txt = Array.from(document.querySelectorAll("div,span")).find(
      (el) => el.textContent.trim().startsWith("Pay $") && el.childElementCount === 0
    );
    if (!txt) return { found: false };
    let n = txt;
    for (let i = 0; i < 8; i++) {
      n.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      n.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      n.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      n = n.parentElement;
      if (!n) break;
    }
    return { found: true };
  });
  console.log("Pay click attempts:", payClicked);
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: "test-web-payment-after-pay.png", fullPage: false });

  // 7) Wait for success banner or error
  let outcome = "TIMEOUT";
  try {
    outcome = await Promise.race([
      page
        .waitForFunction(() => document.body.innerText.includes("added to your account"), { timeout: 30000 })
        .then(() => "SUCCESS"),
      page
        .waitForFunction(
          () => {
            const t = document.body.innerText;
            return /failed|declined|error/i.test(t) && !t.includes("Best Value");
          },
          { timeout: 30000 }
        )
        .then(() => "FAILURE"),
    ]);
  } catch (e) {
    outcome = "TIMEOUT: " + e.message;
  }
  console.log("OUTCOME:", outcome);

  // 8) Snapshot final state
  await page.screenshot({ path: "test-web-payment-result.png", fullPage: false });
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log("Final UI text:");
  console.log(text);

  await browser.close();
  process.exit(outcome.startsWith("SUCCESS") ? 0 : 1);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
