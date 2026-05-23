/* solitaire_claude/game.js */
(function () {
  'use strict';

  var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  var SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var RANK_VALUE = {};
  RANKS.forEach(function (r, i) { RANK_VALUE[r] = i; });

  /* ---- State ---- */
  var state = {
    stock: [],
    waste: [],
    tableau: [[], [], [], [], [], [], []],
    foundation: [[], [], [], []],
    selected: null   // { location: 'waste'|'tableau'|'foundation', index, cardIndex? }
  };

  var cardIdCounter = 0;

  /* ---- Deck helpers ---- */
  function createDeck() {
    cardIdCounter = 0;
    var deck = [];
    SUITS.forEach(function (suit) {
      var color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
      RANKS.forEach(function (rank) {
        deck.push({
          id: cardIdCounter++,
          suit: suit,
          rank: rank,
          color: color,
          isFaceUp: false
        });
      });
    });
    return deck;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ---- Deal ---- */
  function deal() {
    state.selected = null;
    var deck = shuffle(createDeck());
    state.stock = [];
    state.waste = [];
    state.tableau = [[], [], [], [], [], [], []];
    state.foundation = [[], [], [], []];

    // Deal tableau: col i gets i+1 cards, top card face up
    var dealIdx = 0;
    for (var col = 0; col < 7; col++) {
      for (var row = 0; row <= col; row++) {
        var card = deck[dealIdx++];
        card.isFaceUp = (row === col);
        state.tableau[col].push(card);
      }
    }

    // Remaining cards go to stock
    state.stock = deck.slice(dealIdx).map(function (c) { c.isFaceUp = false; return c; });

    render();
  }

  /* ---- Move validation ---- */
  function canPlaceOnTableau(card, targetCol) {
    var col = state.tableau[targetCol];
    if (col.length === 0) return card.rank === 'K';
    var top = col[col.length - 1];
    if (!top.isFaceUp) return false;
    return top.color !== card.color && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] - 1;
  }

  function canPlaceOnFoundation(card, foundationIdx) {
    var pile = state.foundation[foundationIdx];
    if (pile.length === 0) return card.rank === 'A';
    var top = pile[pile.length - 1];
    return top.suit === card.suit && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1;
  }

  /* ---- Get movable cards from tableau ---- */
  function getMovableCards(colIdx, fromCardIndex) {
    var col = state.tableau[colIdx];
    var cards = [];
    for (var i = fromCardIndex; i < col.length; i++) {
      if (!col[i].isFaceUp) break;
      cards.push(col[i]);
    }
    // Validate sequence is valid (descending, alternating color)
    for (var j = 1; j < cards.length; j++) {
      if (cards[j].color === cards[j - 1].color ||
          RANK_VALUE[cards[j].rank] !== RANK_VALUE[cards[j - 1].rank] - 1) {
        return [cards[0]]; // Only allow single card move
      }
    }
    return cards;
  }

  /* ---- Execute moves ---- */
  function moveCards(fromLoc, fromIdx, fromCardIdx, toLoc, toIdx) {
    var cards;

    // Extract cards from source
    if (fromLoc === 'waste') {
      cards = [state.waste[state.waste.length - 1]];
      state.waste.pop();
    } else if (fromLoc === 'tableau') {
      cards = getMovableCards(fromIdx, fromCardIdx);
      state.tableau[fromIdx].splice(fromCardIdx, cards.length);
      // Auto-flip the new top card
      var col = state.tableau[fromIdx];
      if (col.length > 0 && !col[col.length - 1].isFaceUp) {
        col[col.length - 1].isFaceUp = true;
      }
    } else if (fromLoc === 'foundation') {
      cards = [state.foundation[fromIdx].pop()];
    }

    if (!cards.length) return false;

    // Place on destination
    if (toLoc === 'tableau') {
      if (!canPlaceOnTableau(cards[0], toIdx)) return false;
      cards.forEach(function (c) { c.isFaceUp = true; state.tableau[toIdx].push(c); });
    } else if (toLoc === 'foundation') {
      // Only single card to foundation
      if (cards.length > 1) return false;
      if (!canPlaceOnFoundation(cards[0], toIdx)) return false;
      cards[0].isFaceUp = true;
      state.foundation[toIdx].push(cards[0]);
    }

    state.selected = null;
    render();
    checkWin();
    return true;
  }

  /* ---- Stock draw ---- */
  function drawStock() {
    if (state.stock.length === 0) {
      // Recycle waste to stock (face down, reverse order)
      if (state.waste.length === 0) return;
      state.stock = state.waste.reverse().map(function (c) { c.isFaceUp = false; return c; });
      state.waste = [];
    } else {
      var card = state.stock.pop();
      card.isFaceUp = true;
      state.waste.push(card);
    }
    state.selected = null;
    render();
  }

  /* ---- Win check ---- */
  function checkWin() {
    var total = 0;
    state.foundation.forEach(function (f) { total += f.length; });
    if (total === 52) {
      document.getElementById('win-overlay').classList.remove('hidden');
    }
  }

  /* ---- Click handling ---- */
  function handleClick(e) {
    var target = e.target.closest('.card, .foundation-pile, #stock-pile');
    if (!target) {
      state.selected = null;
      render();
      return;
    }

    // Stock pile click
    if (target.id === 'stock-pile') {
      drawStock();
      return;
    }

    var cardEl = target.closest('.card');
    var foundationEl = target.closest('.foundation-pile');

    // If a card is selected, try to move it
    if (state.selected) {
      // Clicking the same card deselects
      if (cardEl && cardEl.dataset.cardId == state.selected.cardId) {
        state.selected = null;
        render();
        return;
      }

      // Try moving to foundation
      if (foundationEl) {
        var fIdx = parseInt(foundationEl.dataset.foundation);
        var srcCard;
        if (state.selected.location === 'waste') {
          srcCard = state.waste[state.waste.length - 1];
        } else if (state.selected.location === 'tableau') {
          srcCard = state.tableau[state.selected.index][state.selected.cardIndex];
        } else if (state.selected.location === 'foundation') {
          srcCard = state.foundation[state.selected.index][state.foundation[state.selected.index].length - 1];
        }
        if (srcCard && moveCards(state.selected.location, state.selected.index, state.selected.cardIndex, 'foundation', fIdx)) return;
      }

      // Try moving to tableau
      var tabCol = target.closest('.tableau-column');
      if (tabCol) {
        var tIdx = parseInt(tabCol.dataset.tableau);
        if (moveCards(state.selected.location, state.selected.index, state.selected.cardIndex, 'tableau', tIdx)) return;
      }

      // Click elsewhere deselects
      state.selected = null;
      render();
      return;
    }

    // No selection yet — select a card
    if (cardEl && cardEl.classList.contains('face-up')) {
      var loc = determineCardLocation(cardEl);
      if (loc) {
        state.selected = {
          location: loc.loc,
          index: loc.index,
          cardIndex: loc.cardIndex,
          cardId: cardEl.dataset.cardId
        };
        render();
      }
    }
  }

  function determineCardLocation(cardEl) {
    var id = parseInt(cardEl.dataset.cardId);

    // Check waste
    if (state.waste.length > 0 && state.waste[state.waste.length - 1].id === id) {
      return { loc: 'waste', index: 0, cardIndex: 0 };
    }

    // Check tableau
    for (var c = 0; c < 7; c++) {
      var ci = state.tableau[c].findIndex(function (card) { return card.id === id; });
      if (ci !== -1) return { loc: 'tableau', index: c, cardIndex: ci };
    }

    // Check foundation
    for (var f = 0; f < 4; f++) {
      var fi = state.foundation[f].findIndex(function (card) { return card.id === id; });
      if (fi !== -1 && fi === state.foundation[f].length - 1) {
        return { loc: 'foundation', index: f, cardIndex: fi };
      }
    }

    return null;
  }

  /* ---- Render ---- */
  function render() {
    renderStock();
    renderWaste();
    renderFoundations();
    renderTableau();
    updateStockCount();
  }

  function createCardEl(card) {
    var el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;

    if (!card.isFaceUp) {
      el.classList.add('face-down');
      return el;
    }

    el.classList.add('face-up', card.color);
    var sym = SUIT_SYMBOL[card.suit];

    el.innerHTML =
      '<div class="card-top">' + card.rank + sym + '</div>' +
      '<div class="card-center">' + sym + '</div>' +
      '<div class="card-bottom">' + card.rank + sym + '</div>';

    return el;
  }

  function renderStock() {
    var el = document.getElementById('stock-pile');
    el.innerHTML = '';
    if (state.stock.length > 0) {
      var back = document.createElement('div');
      back.className = 'card face-down';
      el.appendChild(back);
      el.classList.add('clickable');
    } else if (state.waste.length > 0) {
      // Show clickable placeholder to recycle
      var hint = document.createElement('div');
      hint.className = 'card face-down';
      el.appendChild(hint);
      el.classList.add('clickable');
    } else {
      el.classList.remove('clickable');
    }
  }

  function renderWaste() {
    var el = document.getElementById('waste-pile');
    el.innerHTML = '';
    if (state.waste.length > 0) {
      var topCard = state.waste[state.waste.length - 1];
      var cardEl = createCardEl(topCard);
      if (state.selected && state.selected.location === 'waste' && topCard.id == state.selected.cardId) {
        cardEl.classList.add('selected');
      }
      el.appendChild(cardEl);
    }
  }

  function renderFoundations() {
    var piles = document.querySelectorAll('.foundation-pile');
    piles.forEach(function (pile, idx) {
      pile.innerHTML = '';
      // Show suit symbol hint
      if (state.foundation[idx].length > 0) {
        pile.removeAttribute('data-suit');
      } else {
        // Cycle suits: 0=hearts,1=diamonds,2=clubs,3=spades
        pile.setAttribute('data-suit', SUIT_SYMBOL[SUITS[idx]]);
      }
      var f = state.foundation[idx];
      if (f.length > 0) {
        var top = f[f.length - 1];
        var cardEl = createCardEl(top);
        if (state.selected && state.selected.location === 'foundation' &&
            state.selected.index === idx && top.id == state.selected.cardId) {
          cardEl.classList.add('selected');
        }
        pile.appendChild(cardEl);
      }
    });
  }

  function renderTableau() {
    var columns = document.querySelectorAll('.tableau-column');
    columns.forEach(function (colEl, colIdx) {
      colEl.innerHTML = '';
      var col = state.tableau[colIdx];
      // Clear data attribute for empty columns
      if (col.length === 0) {
        colEl.removeAttribute('data-suit');
        return;
      }

      var offsetStep = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tableau-offset')) || 22;
      col.forEach(function (card, rowIdx) {
        var cardEl = createCardEl(card);
        cardEl.style.top = (rowIdx * offsetStep) + 'px';

        // Highlight selected
        if (state.selected && state.selected.location === 'tableau' &&
            state.selected.index === colIdx && state.selected.cardIndex === rowIdx) {
          cardEl.classList.add('selected');
        }

        colEl.appendChild(cardEl);
      });

      // Adjust column height to fit all cards
      var cardH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-h')) || 112;
      var totalH = col.length * offsetStep + cardH;
      colEl.style.minHeight = Math.max(totalH, cardH) + 'px';
    });
  }

  function updateStockCount() {
    document.getElementById('stock-count').textContent = state.stock.length;
  }

  /* ---- Public API ---- */
  window.__solitaire = {
    getState: function () {
      return {
        stock: state.stock.map(function (c) { return { id: c.id, suit: c.suit, rank: c.rank, color: c.color, isFaceUp: c.isFaceUp }; }),
        waste: state.waste.map(function (c) { return { id: c.id, suit: c.suit, rank: c.rank, color: c.color, isFaceUp: c.isFaceUp }; }),
        tableau: state.tableau.map(function (col) {
          return col.map(function (c) { return { id: c.id, suit: c.suit, rank: c.rank, color: c.color, isFaceUp: c.isFaceUp }; });
        }),
        foundation: state.foundation.map(function (f) {
          return f.map(function (c) { return { id: c.id, suit: c.suit, rank: c.rank, color: c.color, isFaceUp: c.isFaceUp }; });
        })
      };
    }
  };

  /* ---- Init ---- */
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('board').addEventListener('click', handleClick);
    document.getElementById('restart-btn').addEventListener('click', deal);
    document.getElementById('play-again-btn').addEventListener('click', function () {
      document.getElementById('win-overlay').classList.add('hidden');
      deal();
    });
    deal();
  });
})();
