
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = `
<a class="B4vNQ" href="/pn/tata-sampann-100-pure-seedless-black-raisins/pvid/73525afc-6e59-4a69-bb7b-f88f57730b59">
<div class="cslgId cTH4Df" style="background-color: white;" data-variant="edlp" data-size="sm" data-device="desktop" data-is-out-of-stock="false" data-fluid-width="true" data-theme="light">
<div data-slot-id="ProductImageWrapper" class="cCMsku c8rmYa"><div class="c8QQnr cCX8Kb c6xSKo"><img alt="Tata Sampann 100% Pure | Seedless Black Raisins" title="Tata Sampann 100% Pure | Seedless Black Raisins" class="c2ahfT" loading="lazy" src="https://cdn.zeptonow.com/production/tr:w-403,ar-1200-1200,pr-true,f-auto,q-40,dpr-2/cms/product_variant/4a3b0f80-d839-4519-9d11-e15e2bab4e60.jpeg"><button data-mode="edlp" class="ciE0m4 ceUl7T cuPUm6 cnCei3" data-size="sm" data-show-variant-selector="false">ADD</button></div></div>
<div class="czJRzd cdn80O" data-slot-id="EdlpPrice"><span class="cptQT7">₹180</span><span class="cx3iWL">₹240</span></div>
<div class="c0aYst cTlV3p"><div class="cYCsFo"><span>₹60</span><span>OFF</span></div><div class="chXCe2"></div></div>
<div data-clamp="3" data-slot-id="ProductName" class="cQAjo6 ch5GgP"><span>Tata Sampann 100% Pure | Seedless Black Raisins</span></div>
<div data-slot-id="PackSize" class="cyNbxx c0ZFba"><span>1 pack (200 g)</span></div>
<div class="c0EIEw">
<div data-slot-id="RatingInformation" class="cP7Ax8">
<span class="cPdMhy"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" color="#329537"><path fill="currentColor" d="M5.169 1.51c.218-.236.48-.428.831-.428.352 0 .613.192.832.427.208.225.432.552.698.94l.4.585c.165.239.2.282.24.311.04.03.093.05.37.132l.68.2c.452.133.831.245 1.11.374.292.135.555.325.663.659.109.334.008.642-.15.922-.149.268-.39.582-.677.955l-.432.562c-.177.23-.207.276-.222.324-.016.047-.02.103-.011.393l.02.708c.012.47.023.866-.013 1.17-.038.32-.138.629-.422.835-.284.207-.608.205-.924.143-.3-.06-.673-.192-1.117-.35l-.668-.237c-.273-.097-.327-.111-.377-.111-.05 0-.103.014-.377.11l-.667.238c-.444.158-.816.29-1.118.35-.315.062-.64.064-.923-.143-.284-.206-.384-.515-.422-.834-.036-.305-.025-.7-.012-1.171l.02-.708c.007-.29.004-.346-.012-.393-.015-.048-.045-.095-.222-.324l-.432-.562c-.287-.373-.528-.687-.678-.955-.157-.28-.258-.588-.15-.922.109-.334.372-.524.664-.66.278-.128.658-.24 1.11-.373l.68-.2c.277-.082.33-.103.37-.132.04-.03.075-.072.239-.311l.4-.585c.267-.388.49-.715.699-.94Z"></path></svg>4.8</span>
<span class="cuNaP7">(2.3k)</span>
</div>
<div data-slot-id="VerticalSeparator" class="cEKRSB"></div>
<div data-slot-id="EtaInformation" class="cTDqth cTDqth">8 mins</div>
</div>
</div>
</a>
`;

const dom = new JSDOM(html);
const document = dom.window.document;
const productLinks = document.querySelectorAll('a.B4vNQ');
const link = productLinks[0];

// Selectors from server.js
const selectors = {
    productCard: 'div.cTH4Df',
    rating: '[data-slot-id="RatingInformation"] > span:first-child', // The one I updated
    ratingOld: '[data-slot-id="RatingInformation"]',
};

const card = link.querySelector(selectors.productCard) || link;

console.log("Card found:", !!card);

// Test New Selector
console.log("\n--- Testing New Logic ---");
let rating = null;
const ratingEl = card.querySelector(selectors.rating);
console.log("Selector used:", selectors.rating);
console.log("Rating element found:", !!ratingEl);
if (ratingEl) {
    const text = ratingEl.textContent || '';
    console.log("Rating element textContent:", `"${text}"`);
    const match = text.match(/(\d+(\.\d+)?)/);
    console.log("Match:", match);
    if (match) rating = parseFloat(match[1]);
}
console.log("Resulting Rating:", rating);


// Test Old Logic (to see why it might have failed or passed)
console.log("\n--- Testing Old Logic ---");
let ratingOld = null;
const ratingElOld = card.querySelector(selectors.ratingOld);
console.log("Selector used:", selectors.ratingOld);
console.log("Rating element found:", !!ratingElOld);
if (ratingElOld) {
    const text = ratingElOld.textContent || '';
    console.log("Rating element textContent:", `"${text}"`);
    // The previous regex was strict (\d+\.\d+)
    const matchStrict = text.match(/(\d+\.\d+)/);
    console.log("Match Strict:", matchStrict);

    // The updated loose regex
    const matchLoose = text.match(/(\d+(\.\d+)?)/);
    console.log("Match Loose:", matchLoose);
}


// Check for SVG noise
if (ratingEl) {
    console.log("\n--- innerHTML of New Selector ---");
    console.log(ratingEl.innerHTML);
}
