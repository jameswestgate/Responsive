
/* A polyfill to add CSS media queries, matchMedia and media query listeners to unsupported browsers
/* Based on respond.js (https://github.com/scottjehl/Respond/)  and matchMedia.js (https://github.com/paulirish/matchMedia/)
/* Copyright James Westgate 2012 */
/* Dual licensed under the MIT and GPL licenses */

(function(){
    
    //Feature detect
    if (window.matchMedia && window.matchMedia("only all").matches) return;

    //define vars
    var doc = window.document,
        docElem  = doc.documentElement,
        mediastyles = [],
        rules = [],
        appendedEls = [],
        resizeThrottle = 30,
        head = doc.getElementsByTagName("head")[0] || docElem,
        base = doc.getElementsByTagName("base")[0],
        links = head.getElementsByTagName("link"),
        canMediaQuery,
        refNode = docElem.firstElementChild || docElem.firstChild,
        fakeBody = doc.createElement('body'), // fakeBody required for <FF4 when executed in <head>
        div = doc.createElement('div');

    //Set up the media query list
    window.matchMedia = function(q){

        var query, ls = [];

        query = {
            matches: false,
            media: q,
            addListener: function(listener) {
                if (typeof listener === 'function') ls.push(listener);
            },
            removeListener: function(listener) {
                for (var i=0,len=ls.length; i<len; i++) if (ls[i] === listener) delete ls[i];
            }
        };

        query._listeners = ls;
        query._matches = false;

        //Parse the query
        translate(q, '', '', query);

        return query;
    };

    //feature detect media queries (we still need code for listeners though)
    function detectMediaQuery() {
        div.id = 'mq-test-1';
        div.style.cssText = "position:absolute;top:-100em";
        fakeBody.appendChild(div);

        div.innerHTML = '&shy;<style>@media only all {#mq-test-1 { width: 42px; }}</style>';

        docElem.insertBefore(fakeBody, refNode);
        canMediaQuery = div.offsetWidth == 42;
        docElem.removeChild(fakeBody);

        if (canMediaQuery) {
            applyMedia();
        }
        else {
            ripCSS();
        }
    }

    //loop stylesheets, send text content to translate
    function ripCSS(){

        var parsedSheets = {};
        var sheet, href, media, isCSS; //vars for loop:

        for (var i=0, sl = links.length; i < sl; i++) {
            
            sheet = links[i];
            href = sheet.href;
            media = sheet.media;
        
            //only links plz and prevent re-parsing
            if (href && sheet.rel && sheet.rel.toLowerCase() === "stylesheet" && !parsedSheets[href]) {
                
                parsedSheets[href] = true;

                //Test if same domain, request css
                if (!base && (!/^([a-zA-Z:]*\/\/)/.test(href)) || href.replace(RegExp.$1, "").split("/")[0] === window.location.host) {
                    
                    ajax(href, function(styles) {
                        translate(styles, href, media);
                    });
                }
            }
        }

    }

    //find media blocks in css text, convert to style blocks
    function translate(styles, href, media, query) {

        var qs = styles.match(/@media[^\{]+\{([^\{\}]*\{[^\}\{]*\})+/gi);
        var ql = qs && qs.length || 0;
            
        //try to get CSS path
        var href = href.substring(0, href.lastIndexOf("/"));
        var useMedia = !ql && media;

        //vars used in loop
        var fullq, thisq, eachq, eql;

        //if path exists, tack on trailing slash
        if (href.length) href += "/"; 

        //if no internal queries exist, but media attr does, use that
        //note: this currently lacks support for situations where a media attr is specified on a link AND its associated stylesheet has internal CSS media queries.
        //In those cases, the media attribute will currently be ignored.
        if (query || useMedia ) ql = 1;

        for (var i=0; i < ql; i++){

            //Push the query object into the rules list instead of styles
            if (query) {
                fullq = query.media;
                rules.push(query);
            }
            else {

                //media attr
                if (useMedia) {
                    fullq = media;
                    rules.push(repUrls(styles));
                }
                //parse for styles
                else {
                    fullq = qs[i].match( /@media *([^\{]+)\{([\S\s]+?)$/ ) && RegExp.$1;
                    rules.push( RegExp.$2 && repUrls( RegExp.$2 ) );
                }
            }

            eachq = fullq.split( "," );
            eql = eachq.length;

            for(var j=0; j < eql; j++) {
                thisq = eachq[j];
                
                var mediastyle = {
                    media: thisq.split("(")[0].match(/(only\s+)?([a-zA-Z]+)\s?/) && RegExp.$2 || "all",
                    rules: rules.length - 1,
                    hasquery: thisq.indexOf("(") > -1,
                    minw: thisq.match( /\(min\-width:[\s]*([\s]*[0-9\.]+)(px|em)[\s]*\)/ ) && parseFloat(RegExp.$1) + (RegExp.$2 || ""),
                    maxw: thisq.match( /\(max\-width:[\s]*([\s]*[0-9\.]+)(px|em)[\s]*\)/ ) && parseFloat(RegExp.$1) + (RegExp.$2 || "")
                };

                if (mediastyle.minw) mediastyle.minw = parseFloat(mediastyle.minw);
                if (mediastyle.maxw) mediastyle.maxw = parseFloat(mediastyle.maxw);

                mediastyles.push(mediastyle);
            }
        }

        applyMedia();

        function repUrls(css) {
            return css.replace(/(url\()['"]?([^\/\)'"][^:\)'"]+)['"]?(\))/g, "$1" + href + "$2$3");
        }
    }

    var lastCall, resizeDefer;

    //enable/disable styles
    function applyMedia(fromResize){
        var now = (new Date()).getTime();

        //throttle resize calls
        if (fromResize && lastCall && now - lastCall < resizeThrottle) {
            clearTimeout (resizeDefer);
            resizeDefer = setTimeout(applyMedia, resizeThrottle);
            return;
        }
        else {
            lastCall = now;
        }

        var name = "clientWidth",
            docElemProp = docElem[ name ],
            currWidth = doc.compatMode === "CSS1Compat" && docElemProp || doc.body[ name ] || docElemProp,
            styleBlocks = {},
            lastLink = links[ links.length-1 ];

        for (var i=0, len=mediastyles.length; i<len;  i++) {
            var thisstyle = mediastyles[i],
                min = thisstyle.minw,
                max = thisstyle.maxw,
                minnull = (min === null),
                maxnull = (max === null);

            var rule = rules[thisstyle.rules];
            if (rule._listeners) rule.matches = false;

            // if there's no media query at all (the () part), or min or max is not null, and if either is present, they're true
            if (!thisstyle.hasquery || (!minnull || !maxnull) && (minnull || currWidth >= min ) && ( maxnull || currWidth <= max)) {
                
                if (!styleBlocks[thisstyle.media]) styleBlocks[thisstyle.media] = [];

                if (rule._listeners) {
                    var listeners = rule._listeners;
                    rule.matches = true;
                }
                else {
                    styleBlocks[thisstyle.media].push(rule);
                }
            }
        }

        //remove any existing respond style element(s)
        for (var i=0, len=appendedEls.length; i<len; i++) {
            if (appendedEls[i] && appendedEls[i].parentNode === head) head.removeChild(appendedEls[i]);
        }

        //inject active styles, grouped by media type
        for (var i in styleBlocks) {
            var ss = doc.createElement("style"), css = styleBlocks[i].join("\n");

            ss.type = "text/css";
            ss.media = i;

            //originally, ss was appended to a documentFragment and sheets were appended in bulk.
            //this caused crashes in IE in a number of circumstances, such as when the HTML element had a bg image set, so appending beforehand seems best. Thanks to @dvelyk for the initial research on this one!
            head.insertBefore(ss, lastLink.nextSibling);

            if (ss.styleSheet){
                ss.styleSheet.cssText = css;
            }
            else {
                ss.appendChild(doc.createTextNode(css));
            }

            //push to appendedEls to track for later removal
            appendedEls.push(ss);
        }

        //Loop through rules and raise listeners for any changes
        for (var i=0, len=rules.length; i<len; i++) {
            var rule = rules[i];
            if (rule._listeners && rule.matches != rule._matches) {
                rule._matches = rule.matches;
                for (var j=0, len2=rule._listeners.length; j<len2; j++) if (rule._listeners[j]) rule._listeners[j](rule);
            }
        }
    }

    //tweaked Ajax functions from Quirksmode
    function ajax (url, callback) {
            
        var req = (window.XMLHttpRequest) ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP'); //For IE6 and below only, good enough for our purposes
        
        req.open("GET", url, false ); //syncronous call ok since in cache
        req.send();

        callback(req.responseText);
    }

    //adjust on resize
    function callMedia(){
        applyMedia( true );
    }

    //Determine if supports media queries (but doesnt support matchMedia eg IE9) and initialise
    detectMediaQuery();

    if (window.addEventListener) {
        window.addEventListener("resize", callMedia, false);
    }
    else if (window.attachEvent) {
        window.attachEvent("onresize", callMedia);
    }

})();
