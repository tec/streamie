require.def("stream/status",
  ["stream/twitterRestAPI", "stream/helpers", "stream/location", "stream/keyValueStore", "text!../templates/status.ejs.html", "http://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js", "/ext/jquery.autocomplete.js"],
  function(rest, helpers, location, keyValue, replyFormTemplateText) {
    var replyFormTemplate = _.template(replyFormTemplateText);
    
    // get (or make) a form the reply to a tweet
    function getReplyForm(li) { // tweet li
      var form = li.find("form.status");
      if(form.length == 0) { // no form yet, create it
        li.find("div.status").append(replyFormTemplate({
          tweet: li.data("tweet"),
          helpers: helpers
        }));
        form = li.find("form.status");
        var textarea = form.find("[name=status]");
        textarea.focus();
        form.bind("status:send", function () {
          form.hide();
          li.removeClass("form");
          $(window).scrollTop(0); // Good behavior?
        })
        li.addClass("form");
      }
      return form;
    }
    
    function setCaretAtEnd(form, text) { // if text is empty, use the current
      var textarea = form.find("[name=status]");
      if(!text) {
        text = textarea[0].value
      }
      textarea.val(text);
      textarea.focus();
      textarea[0].selectionStart = text.length;
    }
    
    return {
      
      // implement autocomplete for screen_names
      autocomplete: {
        name: "autocomplete",
        func: function (stream) {
          $(document).bind("status:focus", function (e, textarea) {
            if(!textarea.data("autocomplete:names")) {
              textarea.data("autocomplete:names", true);
              textarea.autocomplete(keyValue.Store("screen_names").keys(), {
                multiple: true,
                multipleSeparator: " "
              });
            }
          })
        }
      },
      
      // observe events on status forms
      observe: {
        name: "oberserve",
        func: function (stream) {
          
          // submit event
          $(document).delegate("form.status", "submit", function (e) {
            var form = $(this);
            var status = form.find("[name=status]");
            if(status.val().length > 140) return false; // too long for Twitter
            
            // post to twitter
            rest.post(form.attr("action"), form.serialize(), function () {
              form.find("textarea").val("");
              // { custom-event: status:send }
              form.trigger("status:send");
            })
            return false;
          });
          
          var last;
          function updateCharCount (e) {
            var length = e.target.value.length;
            
            if(length != last) {
              $(e.target).closest("form").find(".characters").text( length );
              last = length;
            }
          }
          
          $(document).delegate("form.status [name=status]", "keyup change paste", updateCharCount)
          
          // update count every N millis to catch any changes, though paste, auto complete, etc.
          $(document).delegate("form.status [name=status]", "focus", function (e) {
            updateCharCount(e)
            var textarea = $(e.target);
            textarea.data("charUpdateInterval", setInterval(function () { updateCharCount(e) }, 200));
            textarea.trigger("status:focus", [textarea]);
          })
          $(document).delegate("form.status [name=status]", "blur", function (e) {
            var interval = $(e.target).data("charUpdateInterval");
            if(interval) {
              clearInterval(interval);
            }
          })
        }
      },
      
      // handle event for the reply form inside tweets
      replyForm: {
        name: "replyForm",
        func: function (stream) {
          $(document).delegate("#stream .actions .reply", "click", function (e) {
            var li = $(this).parents("li");
            var form = getReplyForm(li);
            form.show();
            setCaretAtEnd(form);
          })
        }
      },
      
      // The old style retweet, with the ability to comment on the original text
      quote: {
        name: "quote",
        func: function (stream) {
          $(document).delegate("#stream .quote", "click", function (e) {
            var li = $(this).parents("li");
            var tweet = li.data("tweet");
            var form = getReplyForm(li);
            form.find("[name=in_reply_to_status_id]").val(""); // no reply
            
            // make text. TODO: Style should be configurable
            var text = tweet.data.text + " /via @"+tweet.data.user.screen_name
            
            form.show();
            setCaretAtEnd(form, text)
          })
        }
      },
      
      // Click on retweet button
      retweet: {
        name: "retweet",
        func: function (stream) {
          $(document).delegate("#stream .actions .retweet", "click", function (e) {
            if(confirm("Do you really want to retweet?")) {
              var button = $(this);
              var li = button.parents("li");
              var tweet = li.data("tweet");
              var id = tweet.data.id;
              
              // Post to twitter
              rest.post("/1/statuses/retweet/"+id+".json", function (tweetData, status) {
                if(status == "success") {
                  button.hide();
                  // todo: Maybe redraw the tweet with more fancy marker?
                }
              })
            }
          })
        }
      },
      
      // adds geo coordinates to statusses
      location: {
        name: "location",
        func: function () {
          $(document).delegate("textarea[name=status]", "focus", function () {
            var form = $(this).closest("form");
            
            location.get(function (position) {
              form.find("[name=lat]").val(position.coords.latitude)
              form.find("[name=long]").val(position.coords.longitude)
              form.find("[name=display_coordinates]").val("true");
            })
          });
        }
      },
      
      // Click on favorite button
      favorite: {
        name: "favorite",
        func: function (stream) {
          $(document).delegate("#stream .actions .favorite", "click", function (e) {
            var li = $(this).parents("li");
            var tweet = li.data("tweet");
            var id = tweet.data.id;
            
            if(!tweet.data.favorited) {
              rest.post("/1/favorites/create/"+id+".json", function (tweetData, status) {
                if(status == "success") {
                  tweet.data.favorited = true;
                  li.addClass("starred");
                }
              });
            } else {
              rest.post("/1/favorites/destroy/"+id+".json", function (tweetData, status) {
                if(status == "success") {
                  tweet.data.favorited = false;
                  li.removeClass("starred");
                }
              });
            }
          })
        }
      },
      
      // show all Tweets from one conversation
      conversation: {
        name: "conversation",
        func: function (stream) {
          
          $(document).delegate("#stream .conversation", "click", function (e) {
            e.preventDefault();
            var li = $(this).parents("li");
            var tweet = li.data("tweet");
            var con = tweet.conversation;
            
            $("#mainnav").find("li").removeClass("active") // evil coupling
            
            $("#stream li").removeClass("conversation");
            var className = "conversation"+con.index;
            window.location.hash = "#"+className;
            
            if(!con.styleAppended) {
              con.styleAppended = true;
              // add some dynamic style to the page to hide everything besides this conversation
              var style = '<style type="text/css" id>'+
                'body.'+className+' #content #stream li {display:none;}\n'+
                'body.'+className+' #content #stream li.'+className+' {display:block;}\n'+
                '</style>';
            
                style = $(style);
                $("head").append(style);
            }
            
            $("li."+className).each(function () {
              var li = $(this);
              var tweet = li.data("tweet");
              tweet.fetchNotInStream()
            })
            
          })
        }
      },
      
      // Double click on tweet text turns text into JSON; Hackability FTW!
      showJSON: {
        name: "showJSON",
        func: function (stream) {
          $(document).delegate("#stream p.text", "dblclick", function (e) {
            var p = $(this);
            var li = p.closest("li");
            var tweet = li.data("tweet");
            var pre   = $("<pre class='text'/>");
            tweet = _.clone(tweet);
            delete tweet.node; // chrome hates stringifying these;
            pre.text(JSON.stringify( tweet, null, " " ));
            p.hide().after(pre);
            pre.bind("dblclick", function () {
              pre.remove();
              p.show();
            });
          })
        }
      }
    }
      
  }
);