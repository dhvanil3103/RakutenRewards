// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { cardsIn, productFromPage, setKnownBrands } from "./bestbuy";

beforeEach(() => {
  setKnownBrands(["sony", "bose"]);
  document.body.innerHTML = "";
});

describe("card detection", () => {
  it("reads a search-result card, brand from the title even with a New! prefix", () => {
    document.body.innerHTML = `<ul><li class="product-list-item" data-product-id="111">
      <a class="product-list-item-link" href="/product/sony-wh-ch530/ABC"><h3 class="product-title"><span class="first-title">New!</span> - Sony - WH-CH530 Wireless Headphone</h3></a>
      <div data-testid="price-block-customer-price"><span class="sr-only">$59.99</span></div></li></ul>`;
    const [c] = cardsIn(document, ["Headphones"]);
    expect(c.item).toMatchObject({ id: "111", brand: "sony", price: 59.99, breadcrumb: ["Headphones"] });
  });

  it("finds home-page carousel tiles with unknown markup, one card per product", () => {
    document.body.innerHTML = `<section>
      <div class="tile"><a href="/product/sony-wf-c710n/XYZ1"><img alt="x" src="a.png"></a><a href="/product/sony-wf-c710n/XYZ1">Sony - WF-C710N Earbuds</a><span>$78.00</span></div>
      <div class="tile"><a href="/product/bose-quietcomfort/XYZ2"><img alt="y" src="b.png"></a><a href="/product/bose-quietcomfort/XYZ2">Bose - QuietComfort Headphones</a><span>$299.00</span></div>
    </section>`;
    const cards = cardsIn(document, []);
    expect(cards.map((c) => [c.item.id, c.item.brand, c.item.price])).toEqual([["XYZ1", "sony", 78], ["XYZ2", "bose", 299]]);
    expect(cards[0].el.className).toBe("tile");
  });

  it("keeps a card whose price is missing instead of dropping it", () => {
    document.body.innerHTML = `<div class="tile"><a href="/product/sony-x/ABC9"><img alt="s" src="a.png"></a><a href="/product/sony-x/ABC9">Sony - Open Box Headphones</a></div>`;
    expect(cardsIn(document, [])).toHaveLength(1);
  });
});

describe("product page", () => {
  it("reads Product and BreadcrumbList JSON-LD", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify([
      { "@type": "Product", name: "Sony - WH-1000XM5", sku: "6505727", brand: { name: "Sony" }, offers: { price: 399.99 } },
      { "@type": "BreadcrumbList", itemListElement: [{ name: "Best Buy" }, { name: "Headphones" }, { name: "Over-Ear" }] },
    ])}</script>`;
    expect(productFromPage()).toMatchObject({ id: "6505727", brand: "sony", price: 399.99, breadcrumb: ["Headphones", "Over-Ear"] });
  });
});
