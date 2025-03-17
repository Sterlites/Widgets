javascript:(function(){
    function bingSearchAutomation(){
      console.log("[let's bing] Starting search automation");
      
      // Search terms
      const terms=["algorithm","bandwidth","compiler","daemon","encryption","firmware","gateway","hypervisor","iteration","kernel","latency","middleware","namespace","orchestration","protocol","quantum","recursion","subnet","throughput","virtualization"];
      
      // Configuration
      const maxSearches=10;
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