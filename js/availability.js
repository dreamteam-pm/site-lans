/* Live availability from AppFolio via /.netlify/functions/listings
   - Home page: fills "N Available" tags on community cards
   - Community page: renders open units in #availability and updates the hero badge */
(function () {
  var ENDPOINT = "/.netlify/functions/listings";
  var PHONE_HTML = '<a href="tel:3203104265">(320) 310-4265</a>';

  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function unitCard(l) {
    var bb = (l.beds != null ? l.beds + " bd" : "") + (l.baths != null ? " / " + l.baths + " ba" : "");
    var photo = l.photo ? '<img src="' + esc(l.photo) + '" alt="' + esc(l.address) + '" loading="lazy">' : '<div class="au-nophoto">Photo coming soon</div>';
    return '<article class="avail-unit">'
      + '<div class="au-photo">' + photo + '</div>'
      + '<div class="au-body">'
      + '<div class="au-top"><span class="au-rent">' + esc(l.rent || "Call for rent") + '<small>/mo</small></span><span class="au-bb">' + esc(bb) + '</span></div>'
      + '<div class="au-title">' + esc(l.title || "Apartment") + (l.sqft ? ' &middot; ' + esc(l.sqft) + ' sq ft' : '') + '</div>'
      + '<div class="au-addr">' + esc(l.address) + '</div>'
      + '<div class="au-actions">'
      + (l.detail_url ? '<a class="btn btn-sm btn-ghost" href="' + esc(l.detail_url) + '" target="_blank" rel="noopener">View Details</a>' : '')
      + (l.apply_url ? '<a class="btn btn-sm btn-primary" href="' + esc(l.apply_url) + '" target="_blank" rel="noopener">Apply Now</a>' : '')
      + '</div></div></article>';
  }

  function renderCommunity(data) {
    var box = document.querySelector(".js-avail");
    if (!box) return;
    var slug = box.getAttribute("data-slug");
    var name = box.getAttribute("data-name") || "this community";
    var units = (data.listings || []).filter(function (l) { return l.community === slug; });
    var badge = document.querySelector(".js-avail-badge");
    if (units.length) {
      box.innerHTML = '<p class="avail-intro">' + units.length + (units.length === 1 ? ' home is' : ' homes are') + ' open right now at ' + esc(name) + '. Rents and availability update automatically from our leasing system.</p>'
        + '<div class="avail-grid">' + units.map(unitCard).join("") + '</div>';
      if (badge) badge.textContent = "✅ " + units.length + " Available Now";
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
  }

  fetch(ENDPOINT).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { renderCommunity(data); renderHome(data); })
    .catch(fail);
})();
