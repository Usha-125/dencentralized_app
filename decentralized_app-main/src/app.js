App = {
  loading: false,
  contracts: {},
  ipfs: window.IpfsApi('ipfs.infura.io', 5001, {protocol: 'https'}),
  dweetsLoaded: 0,

  load: async () => {
    try {
      await App.loadWeb3();
      await App.loadAccount();
      await App.loadContract();
      await App.loadUserProfile();
      await App.render();
      $("#loader").hide();
    } catch (error) {
      console.error("Failed to load App:", error);
      $("#loader").show();
      $("#msg").text("Error loading application. Please refresh and try again.");
    }
  },

  loadWeb3: async () => {
    if (window.ethereum) {
      window.web3 = new Web3(window.ethereum);
      try {
        $("#msg").text("Please connect your metamask");
        await window.ethereum.enable();
        App.network = await web3.eth.net.getNetworkType();
      } catch (error) {
        $("#generalMsgModal").modal("show");
        $("#generalModalMessage").text("Permission Denied, Metamask Not connected!");
      }
    } else if (window.web3) {
      window.web3 = new Web3(web3.currentProvider);
    } else {
      $("#generalMsgModal").modal("show");
      $("#generalModalMessage").html("Non-Ethereum browser detected. You should consider trying MetaMask! <br> <a href='https://metamask.io/'>Download Here</a>");
    }
  },

  loadAccount: async () => {
    App.account = await web3.eth.getCoinbase();
  },

  loadContract: async () => {
    try {
      const response = await fetch('Dwitter.json');
      const dwitterArtifact = await response.json();
      App.contracts.dwitter = TruffleContract(dwitterArtifact);
      App.contracts.dwitter.setProvider(web3.currentProvider);
      App.contracts.dwitter = await App.contracts.dwitter.deployed();
    } catch (error) {
      console.error("Error loading contract:", error);
      throw error;
    }
  },

  setLoading: (boolean) => {
    App.loading = boolean;
    const loader = $("#loader");
    const content = $("#content");
    if (boolean) {
      loader.show();
      content.hide();
    } else {
      loader.hide();
      content.show();
    }
  },

  loadUserProfile: async () => {
    try {
      App.userStatus = await App.contracts.dwitter.userStatus({from: App.account});
      
      if (App.userStatus == 0) {
        App.setLoading(true);
        $('#registerModal').modal("show");
        $('#ethAddressForRegisterModal').text(App.account);
        
        $('#registerBtn').on("click", async () => {
          $("#registerModalMsg").text("Processing...");
          let img = $("#profileImg").prop('files')[0];
          let cover = $("#coverImg").prop('files')[0];
          
          const reader1 = new FileReader();
          const reader2 = new FileReader();
          
          reader1.readAsArrayBuffer(img);
          reader2.readAsArrayBuffer(cover);
          
          reader1.onloadend = async function() {
            const buf1 = buffer.Buffer(reader1.result);
            
            reader2.onloadend = async function() {
              const buf2 = buffer.Buffer(reader2.result);
              
              try {
                const result1 = await App.ipfs.files.add(buf1);
                const result2 = await App.ipfs.files.add(buf2);
                
                await App.contracts.dwitter.registerUser(
                  $("#username").val(),
                  $("#name").val(),
                  result1[0].hash,
                  result2[0].hash,
                  $("#bio").val(),
                  {from: App.account}
                );
                
                $('#registerModal').modal("hide");
                App.setLoading(false);
                location.reload();
              } catch (error) {
                console.error("Error in registration:", error);
                $("#registerModalMsg").text("Error in registration. Please try again.");
              }
            }
          }
        });
      } else if (App.userStatus == 2) {
        App.showError("Your Account Has been Banned due to Violations of the Platform");
      } else if (App.userStatus == 3) {
        App.showError("Your Account Has been Deleted");
      } else {
        App.user = await App.contracts.dwitter.getUser({from: App.account});
        $("#account").text(App.account);
        $("#fullname").text(App.user.name);
        $("#username").text(App.user.username);
        $("#userBio").text(App.user.bio);
        $("#userProfileImage").css("background-image", "url(https://ipfs.io/ipfs/" + App.user.imghash + ")");
        $("#userCoverImage").css("background-image", "url(https://ipfs.io/ipfs/" + App.user.coverhash + ")");
      }
    } catch (error) {
      console.error("Error loading user profile:", error);
      throw error;
    }
  },

  render: async () => {
    if (App.loading) return;
    App.setLoading(true);
    await App.renderDweets();
    await App.showAdvertisements();
    App.setLoading(false);
  },

  renderDweets: async () => {
    try {
      const totalDweets = await App.contracts.dwitter.totalDweets();
      const dweetTemplate = $("#dweetTemplate");
      App.dweetsLoaded = Math.max(totalDweets - 10, 1);

      $("#dweetsList").empty();

      for (let i = totalDweets; i >= App.dweetsLoaded; i--) {
        const dweet = await App.contracts.dwitter.getDweet(i);
        const author = await App.contracts.dwitter.getUser(dweet.author);
        
        const newDweet = dweetTemplate.clone();
        newDweet.find('.author-name').text(author.name);
        newDweet.find('.author-username').text(author.username);
        newDweet.find('.dweet-content').text(dweet.content);
        if (dweet.imgHash) {
          newDweet.find('.dweet-image').attr('src', `https://ipfs.io/ipfs/${dweet.imgHash}`);
        }
        newDweet.find('.like-count').text(dweet.likeCount);
        
        // Add event listeners
        newDweet.find('.like-button').click(() => App.likeDweet(i));
        newDweet.find('.comment-button').click(() => App.showComments(i));
        newDweet.find('.report-button').click(() => App.reportDweet(i));
        
        $("#dweetsList").append(newDweet);
      }
    } catch (error) {
      console.error("Error rendering dweets:", error);
      throw error;
    }
  },

  createDweet: async () => {
    try {
      $("#dweetModalMsg").text("Processing....");
      let image = $("#dweetImage").prop("files")[0];
      let hash = "";
      
      if (image) {
        const reader1 = new FileReader();
        reader1.readAsArrayBuffer(image);
        reader1.onloadend = async function() {
          let buf1 = buffer.Buffer(reader1.result);
          var result = await App.ipfs.files.add(buf1);
          hash = result[0].hash;
          await App.contracts.dwitter.methods.createDweet(
            $("#dweetTag").val(),
            $("#dweetContent").val(),
            hash
          ).send({from: App.account});
          $("#dweetModalMsg").text("Dweeted!!!");
        }
      } else {
        await App.contracts.dwitter.methods.createDweet(
          $("#dweetTag").val(),
          $("#dweetContent").val(),
          hash
        ).send({from: App.account});
        $("#dweetModalMsg").text("Dweeted!!!");
      }
    } catch (error) {
      console.error("Error creating dweet:", error);
      $("#dweetModalMsg").text("Error creating dweet");
    }
  },

  like: async (e) => {
    try {
      let dweetId = e.currentTarget.id;
      await App.contracts.dwitter.methods.likeDweet(parseInt(dweetId)).send({from: App.account});
    } catch (error) {
      console.error("Error liking dweet:", error);
      App.showError("Failed to like dweet");
    }
  },

  showComments: async (e) => {
    try {
      $("#commentModal").modal("show");
      let commentTemplate = $("#commentDiv");
      $("#commentDiv").remove();
      let dweetId = parseInt(e.currentTarget.id);
      $(".commentBtn").attr("id", dweetId);
      
      let comments = await App.contracts.dwitter.methods.getDweetComments(dweetId).call({from: App.account});
      
      if (comments.length == 0) {
        $("#commentContainer").html("<h3 class='mx-5'>There are no Comments!</h3>").height("50px");
      } else {
        for (let i = 0; i < comments.length; i++) {
          let comment = await App.contracts.dwitter.methods.getComment(comments[i]).call({from: App.account});
          let author = await App.contracts.dwitter.methods.getUser(comment.author).call({from: App.account});
          let commentDiv = commentTemplate.clone();
          
          commentDiv.find(".image img").attr("src", "https://ipfs.io/ipfs/" + author.imghash);
          commentDiv.find(".title a").html("<b>" + author.name + "</b> @" + author.username);
          commentDiv.find(".time").text(new Date(comment.timestamp * 1000).toDateString());
          commentDiv.find(".post-description p").text(comment.content);
          
          $("#commentContainer").append(commentDiv);
        }
      }

      $(".commentBtn").on("click", async (e) => {
        let dweetId = e.currentTarget.id;
        await App.contracts.dwitter.methods.createComment(dweetId, $("#commentArea").val()).send({from: App.account});
        $("#commentArea").val("");
        $("#commentModal").modal("hide");
      });
    } catch (error) {
      console.error("Error showing comments:", error);
      App.showError("Failed to load comments");
    }
  },

  report: async (e) => {
    try {
      let dweetId = e.currentTarget.id;
      let price = await App.contracts.dwitter.methods.reportingstakePrice().call({from: App.account});
      await App.contracts.dwitter.methods.reportDweet(dweetId).send({
        from: App.account,
        value: price
      });
    } catch (error) {
      console.error("Error reporting dweet:", error);
      App.showError("Failed to report dweet");
    }
  },

  advertise: async () => {
    try {
      $("#advertisementModal").modal("show");
      $("#adSubmit").on("click", async () => {
        let image = $("#adImage").prop('files')[0];
        let link = $("#adLink").val();
        let price = await App.contracts.dwitter.methods.advertisementCost().call({from: App.account});
        
        const reader1 = new FileReader();
        reader1.readAsArrayBuffer(image);
        
        reader1.onloadend = async function() {
          let buf1 = buffer.Buffer(reader1.result);
          var result = await App.ipfs.files.add(buf1);
          hash = result[0].hash;
          await App.contracts.dwitter.methods.submitAdvertisement(hash, link).send({
            from: App.account,
            value: price
          });
          $("#reportDweetModalMsg").text("Success!!!");
        }
      });
    } catch (error) {
      console.error("Error submitting advertisement:", error);
      App.showError("Failed to submit advertisement");
    }
  },

  showAdvertisements: async () => {
    try {
      App.advertisementsList = await App.contracts.dwitter.methods.getAds().call({from: App.account});
      App.noOfAds = App.advertisementsList.length;
      App.currentAd = 0;
      
      async function show() {
        if (App.noOfAds > 0) {
          App.currentAd = (++App.currentAd) % App.noOfAds;
          let adindex = App.currentAd + 1;
          
          let ad = await App.contracts.dwitter.methods.getAd(adindex).call({from: App.account});
          if (ad.status == 1 && (Date.now()/1000) < ad.expiry) {
            $("#ad").attr("href", ad.link);
            $("#ad img").attr("src", "https://ipfs.io/ipfs/" + ad.imgHash);
          } else {
            if (App.noOfAds > 1) show();
            else clearInterval(App.adInterval);
          }
        }
      }

      App.adInterval = setInterval(show, 6000);
    } catch (error) {
      console.error("Error showing advertisements:", error);
    }
  },

  showReportStatus: async () => {
    try {
      $("#statusModal").modal("show");
      $("#reportStatusHead").show();
      $("#advertisementStatusHead").hide();
      $("#statusModalBody").empty();
      
      let reportsList = await App.contracts.dwitter.methods.myReportings().call({from: App.account});
      
      for (var i = 0; i < reportsList.length; i++) {
        let status = await App.contracts.dwitter.methods.getReportedDweetStatus(reportsList[i]).call({from: App.account});
        if (status == 0) {
          let html = `<tr>
            <td>${reportsList[i]}</td>
            <td>Pending</td>
            <td>-</td>
          </tr>`;
          $("#statusModalBody").append(html);
        } else if (status == 1) {
          let userClaimStatus = await App.contracts.dwitter.methods.reportingClaimStatus(reportsList[i]).call({from: App.account});
          if (userClaimStatus == 1) {
            let html = `<tr>
              <td>${reportsList[i]}</td>
              <td>Banned</td>
              <td><button type="button" class="btn-success claimReportReward" id="${reportsList[i]}">Claim</button></td>
            </tr>`;
            $("#statusModalBody").append(html);
          } else if (userClaimStatus == 2) {
            let html = `<tr>
              <td>${reportsList[i]}</td>
              <td>Banned</td>
              <td>Claimed</td>
            </tr>`;
            $("#statusModalBody").append(html);
          }
        } else {
          let html = `<tr>
            <td>${reportsList[i]}</td>
            <td>Free</td>
            <td>Not Eligible</td>
          </tr>`;
          $("#statusModalBody").append(html);
        }
      }

      $(".claimReportReward").on("click", async (e) => {
        let id = e.currentTarget.id;
        await App.contracts.dwitter.methods.claimReportingReward(id).send({from: App.account});
        $("#statusModalMsg").text("Reward Sent");
      });
    } catch (error) {
      console.error("Error showing report status:", error);
      App.showError("Failed to load report status");
    }
  },

  showAdvertisementStatus: async () => {
    try {
      $("#statusModal").modal("show");
      $("#reportStatusHead").hide();
      $("#advertisementStatusHead").show();
      $("#statusModalBody").empty();
      
      let advertisementsList = await App.contracts.dwitter.methods.myAdvertisements().call({from: App.account});
      
      for (var i = 0; i < advertisementsList.length; i++) {
        let status = await App.contracts.dwitter.methods.getAdvertisementStatus(advertisementsList[i]).call({from: App.account});
        if (status == 0) {
          let html = `<tr>
            <td>${advertisementsList[i]}</td>
            <td>Pending</td>
          </tr>`;
          $("#statusModalBody").append(html);
        } else if (status == 1) {
          let html = `<tr>
            <td>${advertisementsList[i]}</td>
            <td>Accepted</td>
          </tr>`;
          $("#statusModalBody").append(html);
        } else {
          let html = `<tr>
            <td>${advertisementsList[i]}</td>
            <td>Rejected</td>
          </tr>`;
          $("#statusModalBody").append(html);
        }
      }
    } catch (error) {
      console.error("Error showing advertisement status:", error);
      App.showError("Failed to load advertisement status");
    }
  },

  showFakeReportingReward: async () => {
    try {
      $("#fakeSuitModal").modal("show");
      let reward = await App.contracts.dwitter.methods.fakeReportingSuitReward().call({from: App.account});
      $("#suitBalance").text(reward);

      $("#withdrawSuitReward").on("click", async () => {
        await App.contracts.dwitter.methods.claimSuitReward().send({from: App.account});
        let newReward = await App.contracts.dwitter.methods.fakeReportingSuitReward().call({from: App.account});
        $("#suitBalance").text(newReward);
      });
    } catch (error) {
      console.error("Error showing fake reporting reward:", error);
      App.showError("Failed to load fake reporting reward");
    }
  },

  RenderMoreDweets: async () => {
    $(window).scroll(async function() {
      console.log("calling Scroll");
      var position = $(window).scrollTop();
      var bottom = $(document).height() - $(window).height();
      console.log(position, " ", bottom);
      
      if (position >= bottom) {
        let currentDweet = App.dweetsLoaded;
        App.dweetsLoaded = App.dweetsLoaded - 2;
        if (App.dweetsLoaded <= 0) App.dweetsLoaded = 1;
        if (currentDweet <= 0) currentDweet = 1;
        
        console.log(App.dweetsLoaded + "\n" + currentDweet);
        
        for (var i = currentDweet; i > App.dweetsLoaded; i--) {
          console.log("FOR LOOP WORKING");
          let dweetcard = $("#dweet");
          
          try {
            let dweet = await App.contracts.dwitter.methods.getDweet(i).call({from: App.account});
            let author = await App.contracts.dwitter.methods.getUser(dweet.author).call({from: App.account});
            console.log(author);
            console.log(dweet);
            
            let dweeettemplate = dweetcard.clone();
            dweeettemplate.find(".fullname strong").html(author.name + `<img src="/public/assets_index/img/tick.png" height="20" width="20">`);
            
            if (dweet.imghash != "") {
              dweeettemplate.find(".tweet-text img").attr("src", "https://ipfs.io/ipfs/" + dweet.imgHash);
            }
            
            dweeettemplate.find(".tweet-text p").text(dweet.content);
            dweeettemplate.find(".username").html(author.username);
            
            let timestamp = new Date(dweet.timestamp * 1000);
            dweeettemplate.find(".tweet-time").html(timestamp.toDateString());
            dweeettemplate.find(".tweet-card-avatar").attr("src", "https://ipfs.io/ipfs/" + author.imghash);
            dweeettemplate.find(".tweet-footer-btn").attr("id", i);
            dweeettemplate.find(".like span").text(dweet.likeCount);
            
            // Add event listeners
            dweeettemplate.find(".like").on("click", App.like);
            dweeettemplate.find(".comment").on("click", App.showComments);
            dweeettemplate.find(".report").on("click", App.report);
            
            console.log(dweeettemplate);
            $("#dweet-list").append(dweeettemplate);
          } catch (e) {
            console.log(e);
          }
        }
      }
    });
  },

  // Initialize the application
  init: async () => {
    try {
      // Load web3
      await App.loadWeb3();
      
      // Load account
      await App.loadAccount();
      
      // Load contract
      await App.loadContract();
      
      // Load user profile
      await App.loadUserProfile();
      
      // Render the app
      await App.render();
      
    } catch (error) {
      console.error("Error initializing app:", error);
      App.showError("Failed to initialize application");
    }
  }
};

// Document ready handler
$(document).ready(function() {
  // Load the app when document is ready
  App.init();

  // Event handlers for various buttons
  $("#dweetBtn").on("click", () => {
    $("#dweetModal").modal("show");
  });

  $("#dweetSubmit").on("click", () => {
    App.createDweet();
  });

  $("#adBtn").on("click", App.advertise);

  $("#reportStatusBtn").on("click", () => {
    App.showReportStatus();
  });

  $("#adStatusBtn").on("click", () => {
    App.showAdvertisementStatus();
  });

  $("#suitRewardBtn").on("click", () => {
    App.showFakeReportingReward();
  });

  // Initialize infinite scroll
  App.RenderMoreDweets();

  // Initialize tooltips
  $('[data-toggle="tooltip"]').tooltip();

  // Handle image preview
  $("#dweetImage").change(function() {
    if (this.files && this.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) {
        $('#imagePreview').attr('src', e.target.result);
        $('#imagePreview').show();
      }
      reader.readAsDataURL(this.files[0]);
    }
  });

  // Handle modal close events
  $('.modal').on('hidden.bs.modal', function () {
    $(this).find('form').trigger('reset');
    $('#imagePreview').hide();
    $('#dweetModalMsg').text('');
  });

  // Error handling for network changes
  if (window.ethereum) {
    window.ethereum.on('networkChanged', function(networkId) {
      location.reload();
    });

    window.ethereum.on('accountsChanged', function(accounts) {
      location.reload();
    });
  }
});

// Export the App object for use in other files if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}