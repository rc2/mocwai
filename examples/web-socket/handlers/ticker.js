// Ticker handler — pushes a mock price update every second until the client disconnects.
// Demonstrates server-initiated messages and cleanup via onClose.
//
// Try it:
//   wscat -c ws://localhost:8080/ws/ticker

const SYMBOLS = ['AAPL', 'GOOG', 'MSFT', 'AMZN', 'TSLA'];
const prices = { AAPL: 189, GOOG: 175, MSFT: 415, AMZN: 193, TSLA: 172 };

function nextPrice(symbol) {
  const delta = (Math.random() - 0.5) * 2;
  prices[symbol] = Math.max(1, prices[symbol] + delta);
  return prices[symbol].toFixed(2);
}

module.exports = {
  onOpen: (ws) => {
    ws.send(JSON.stringify({ type: 'subscribed', symbols: SYMBOLS }));
    ws._tickerInterval = setInterval(() => {
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      ws.send(JSON.stringify({
        type: 'tick',
        symbol,
        price: nextPrice(symbol),
        ts: new Date().toISOString(),
      }));
    }, 1000);
  },

  onClose: (ws) => {
    clearInterval(ws._tickerInterval);
  },
};
