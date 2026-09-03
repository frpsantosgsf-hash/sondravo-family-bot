const http = require("http");

const port = Number(process.env.PORT || 10000);

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Sondravo Family bot is online.\n");
}).listen(port, "0.0.0.0", () => {
  console.log(`✅ Health server luistert op poort ${port}`);
});

require("./index.js");
