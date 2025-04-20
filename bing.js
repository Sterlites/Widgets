(function() {
  let searchCount = 0;
  let maxSearches = 30;
  let searchTerms = [
      "algorithm", "bandwidth", "compiler", "daemon", "encryption", "firmware",
      "gateway", "hypervisor", "iteration", "kernel", "latency", "middleware",
      "namespace", "orchestration", "protocol", "quantum", "recursion", "subnet",
      "throughput", "virtualization", "API", "authentication", "bitrate", "cache",
      "cloud", "cybersecurity", "data", "database", "debugging", "deployment",
      "DNS", "encryption", "firewall", "hashing", "hosting", "HTTP", "HTTPS",
      "integration", "IP", "JavaScript", "JSON", "load balancing", "machine learning",
      "memory", "metadata", "microservice", "network", "node", "object-oriented",
      "packet", "partition", "persistence", "ping", "query", "rate-limiting",
      "rendering", "repository", "scalability", "schema", "script", "SDK",
      "serialization", "session", "stack", "streaming", "syntax", "template",
      "thread", "token", "transaction", "UI", "UX", "virtual machine", "WAN",
      "websocket", "workload", "XML", "YAML", "zero-day", "ZKP", "ACL", "analytics",
      "big data", "blockchain", "CI/CD", "compression", "container", "cookie",
      "crawler", "daemon", "DevOps", "edge computing", "failover", "hash table",
      "IoT", "IPSec", "log file", "MFA", "NAT", "NVMe", "QoS", "rate-limiting",
      "abstraction", "asynchronous", "back-end", "binary", "buffer", "bytecode",
      "cloud-native", "containerization", "cryptographic", "data structure",
      "decentralization", "encapsulation", "event-driven", "framework", "frontend",
      "functional programming", "GPU", "hashmap", "infosec", "internet", "IP address",
      "iteration", "JVM", "kubernetes", "library", "linker", "load testing",
      "logical operator", "minification", "neural network", "object model",
      "packet switching", "parameterization", "polymorphism", "proxy server",
      "queueing", "RAM", "random number generator", "recurrence", "relational database",
      "runtime", "sandboxing", "scripting", "serverless", "stack trace", "state machine",
      "test-driven development", "TLS", "transactional", "unit testing",
      "versioning", "WebRTC", "workflow", "z-index", "agile methodology",
      "branching", "browser", "build pipeline", "byte stream", "cipher",
      "client-server", "codebase", "compression algorithm", "data lake",
      "distributed computing", "ETL", "fuzz testing", "git repository", "global state",
      "hash algorithm", "hosting environment", "identity management", "immutable",
      "key-value pair", "load balancer", "low-code", "message queue", "multi-threading",
      "natural language processing", "OAuth", "ORM", "performance profiling",
      "query optimization", "relational model", "server farm", "SOC", "stateful",
      "transaction log", "transpiler", "UI framework", "virtual DOM", "visualization",
      "VPN", "web analytics", "web framework", "zero-downtime", "zlib"
  ];
  let searchedTerms = [];
  let stopSearch = false;

  function getRandomTerm() {
      let term;
      do {
          term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      } while (searchedTerms.includes(term));
      searchedTerms.push(term);
      return term;
  }

  function getRandomDelay(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function findSearchBox() {
      return document.querySelector("#sb_form_q") || document.querySelector("input[name='q']") || document.querySelector("input[type='search']");
  }

  function performSearch() {
      if (stopSearch || searchCount >= maxSearches) {
          console.log("[Bing Automation] All searches completed or stopped.");
          return;
      }

      if (!window.location.hostname.includes("bing.com")) {
          window.location.href = "https://www.bing.com/";
          return;
      }

      let term = getRandomTerm();
      searchCount++;
      console.log(`[Bing Automation] Search ${searchCount}/${maxSearches}: ${term}`);

      let searchBox = findSearchBox();
      if (!searchBox) {
          console.error("[Bing Automation] Search box not found.");
          return;
      }

      searchBox.value = term;
      searchBox.dispatchEvent(new Event("input", { bubbles: true }));

      setTimeout(() => {
          let searchButton = document.querySelector("#search_icon") || document.querySelector("button[type='submit']");
          if (searchButton) {
              searchButton.click();
          } else {
              let form = searchBox.closest("form");
              if (form) form.submit();
          }

          if (searchCount < maxSearches && !stopSearch) {
              let delay = getRandomDelay(3000, 10000);
              console.log(`[Bing Automation] Next search in ${delay / 1000} seconds.`);
              setTimeout(performSearch, delay);
          }
      }, 500);
  }

  window.stopBingSearch = function() {
      stopSearch = true;
      console.log("[Bing Automation] Search automation stopped.");
  };

  performSearch();
})();