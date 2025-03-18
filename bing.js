// Description: paste it in browser console three times to start searching on Bing
javascript:(function(){
    function bingSearchAutomation(){
      console.log("[let's bing] Starting search automation");
      
      // Search terms
      const terms = [
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
      
      
      
      // Configuration
      const maxSearches=30;
      let searchCount=0;
      
      // Helper functions
      function randomTerm(){return terms[Math.floor(Math.random()*terms.length)];}
      function randomDelay(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
      
      // Single search function
      function doSearch(){
        if(searchCount>=maxSearches){
          console.log("[let's bing] All searches completed");
          return;
        }
        
        // Check if on Bing
        if(!window.location.hostname.includes("bing.com")){
          window.location.href="https://www.bing.com/";
          return;
        }
        
        const term=randomTerm();
        searchCount++;
        console.log(`[let's bing] Search ${searchCount}/${maxSearches}: ${term}`);
        
        // Find search box
        const searchBox=document.querySelector("#sb_form_q")||document.querySelector("input[name='q']");
        if(!searchBox){
          console.log("[let's bing] Search box not found");
          return;
        }
        
        // Fill and submit search
        searchBox.value=term;
        searchBox.dispatchEvent(new Event("input",{bubbles:true}));
        
        setTimeout(function(){
          // Try to click search button
          const searchButton=document.querySelector("#search_icon")||document.querySelector("button[type='submit']");
          if(searchButton){
            searchButton.click();
          }else{
            // Try form submit
            const form=searchBox.closest("form");
            if(form) form.submit();
          }
          
          // Schedule next search
          if(searchCount<maxSearches){
            const nextDelay=randomDelay(3000,8000);
            console.log(`[let's bing] Next search in ${nextDelay/1000} seconds`);
            setTimeout(doSearch,nextDelay);
          }
        },500);
      }
      
      // Start searching
      doSearch();
    }
    
    bingSearchAutomation();
  })();