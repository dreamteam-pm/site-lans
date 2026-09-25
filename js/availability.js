/* Live availability from AppFolio via /.netlify/functions/listings
   - Home page: fills "N Available" tags on community cards
   - Community page: renders open + coming-soon units in #availability and updates the hero badge
   - Rentals search page: exposes window.DTAvail.unitCard and the loaded data */
(function () {
  var ENDPOINT = "/.netlify/functions/listings";
  var PHONE_HTML = '<a href="tel:3203104265">(320) 310-4265</a>';

  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function whenLabel(l) {
    if (!l.available || l.available === "now") return { text: "Available Now", soon: false };
    return { text: "Available " + l.available, soon: true };
  }

  function unitCard(l, opts) {
    opts = opts || {};
    var bb = (l.beds != null ? (l.beds === 0 ? "Studio" : l.beds + " bd") : "") + (l.baths != null ? " / " + l.baths + " ba" : "");
    var photo = l.photo ? '<img src="' + esc(l.photo) + '" alt="' + esc(l.address) + '" loading="lazy">' : '<div class="au-nophoto">Photo coming soon</div>';
    var when = whenLabel(l);
    var community = opts.showCommunity && l.community_name ? '<a class="au-comm" href="' + esc(l.community) + '.html#availability">' + esc(l.community_name) + '</a>' : '';
    return '<article class="avail-unit">'
      + '<div class="au-photo">' + photo + '<span class="au-when' + (when.soon ? ' is-soon' : '') + '">' + esc(when.text) + '</span></div>'
      + '<div class="au-body">'
      + '<div class="au-top"><span class="au-rent">' + esc(l.rent || "Call for rent") + '<small>/mo</small></span><span class="au-bb">' + esc(bb) + '</span></div>'
      + '<div class="au-title">' + esc(l.title || "Apartment") + (l.sqft ? ' &middot; ' + esc(l.sqft) + ' sq ft' : '') + '</div>'
      + '<div class="au-addr">' + esc(l.address) + '</div>'
      + community
      + '<div class="au-actions">'
      + (l.detail_url ? '<a class="btn btn-sm btn-ghost" href="' + esc(l.detail_url) + '" target="_blank" rel="noopener">View Details</a>' : '')
      + (l.apply_url ? '<a class="btn btn-sm btn-primary" href="' + esc(l.apply_url) + '" target="_blank" rel="noopener">Apply Now</a>' : '')
      + '</div></div></article>';
  }

  function sortUnits(units) {
    // Available-now first, then soonest date, then rent
    return units.slice().sort(function (a, b) {
      var an = !a.available || a.available === "now", bn = !b.available || b.available === "now";
      if (an !== bn) return an ? -1 : 1;
      if (!an && a.available !== b.available) return new Date(a.available) - new Date(b.available);
      return parseInt(String(a.rent).replace(/\D/g, "") || 0, 10) - parseInt(String(b.rent).replace(/\D/g, "") || 0, 10);
    });
  }

  function renderCommunity(data) {
    var box = document.querySelector(".js-avail");
    if (!box) return;
    var slug = box.getAttribute("data-slug");
    var name = box.getAttribute("data-name") || "this community";
    var units = sortUnits((data.listings || []).filter(function (l) { return l.community === slug; }));
    var now = units.filter(function (l) { return !l.available || l.available === "now"; }).length;
    var soon = units.length - now;
    var badge = document.querySelector(".js-avail-badge");
    if (units.length) {
      var intro;
      if (now && soon) intro = now + (now === 1 ? " home is" : " homes are") + " open now and " + soon + (soon === 1 ? " is" : " are") + " coming available soon at " + esc(name) + ".";
      else if (now) intro = now + (now === 1 ? " home is" : " homes are") + " open right now at " + esc(name) + ".";
      else intro = soon + (soon === 1 ? " home is" : " homes are") + " coming available soon at " + esc(name) + ". Apply early to reserve it.";
      box.innerHTML = '<p class="avail-intro">' + intro + ' Rents and dates update automatically from our leasing system.</p>'
        + '<div class="avail-grid">' + units.map(function (l) { return unitCard(l); }).join("") + '</div>';
      if (badge) badge.textContent = now ? "✅ " + now + " Available Now" + (soon ? " + " + soon + " Coming Soon" : "") : "⏳ " + soon + " Coming Soon";
    } else {
      box.innerHTML = '<div class="avail-empty"><strong>No open units at ' + esc(name) + ' right now.</strong> '
        + 'Homes here turn over regularly. Call ' + PHONE_HTML + ' to join the waitlist, or <a href="rentals.html">browse everything available today &rarr;</a></div>';
      if (badge) badge.textContent = "Join the waitlist";
    }
  }

  function renderHome(data) {
    var cards = document.querySelectorAll(".community-card[data-slug]");
    if (!cards.length) return;
    var counts = data.counts || {};
    cards.forEach(function (card) {
      var n = counts[card.getAttribute("data-slug")] || 0;
      var tag = card.querySelector(".js-cc-avail");
      if (!tag) return;
      if (n > 0) { tag.textContent = n + " Available"; tag.hidden = false; }
      else { tag.hidden = true; }
    });
  }

  function fail() {
    var box = document.querySelector(".js-avail");
    if (box) box.innerHTML = '<div class="avail-empty">Live availability is loading slowly. <a href="rentals.html">See all available rentals &rarr;</a> or call ' + PHONE_HTML + '.</div>';
    if (window.DTAvail.onFail) window.DTAvail.onFail();
  }

  window.DTAvail = { unitCard: unitCard, sortUnits: sortUnits, data: null, onData: null, onFail: null };

  fetch(ENDPOINT).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      window.DTAvail.data = data;
      renderCommunity(data); renderHome(data);
      if (window.DTAvail.onData) window.DTAvail.onData(data);
    })
    .catch(fail);
})();
