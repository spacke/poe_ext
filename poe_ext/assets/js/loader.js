var numTabs = 0;
var oTabs = {};
var oLeagueChars = {};

var currentItems = null;
var postThrottle = null;

// some defaults...
var currentLeague = '';
var lastView = '#openRareList';
var aVisibleCols = [];


// set in parseItems
var oTypes = {};
var oRarity = {};
var oProps = {};
var oRequired = {};
var oMods = {};
var oCalc = {};


$(function(){
	
	getVersion();
	
	postThrottle = new Throttle(30000);

	// initialise the local browser db, once going, start loading data...
	var dbOpenPromise = initCache()
		.done(function(db, event){
			// load list of chars from server (or cache)
			// callback will select last selected char if there is one in the cache
			loadPageData();

		})
	;


	
});

function loadPageData() {
	refreshData(function(){
		getCache('last-league')
			.done(function(charName) {
				$('#leagueSelector li a[title="' + charName + '"]').trigger('click');						
			})
			.fail(function(){
				// load league with the most chars
				var league = '';
				var charCount = 0;
				for (var l in oLeagueChars) {
					if (oLeagueChars[l].length > charCount) {
						charCount = oLeagueChars[l].length;
						league = l;
					}
				}
				if (league != '') $('#leagueSelector li a[title="' + league + '"]').trigger('click');

			})
		;
	});	
}

$('#refresh').click(function () {

	// store charname before we reset list of chars
	var charName = currentLeague;
	var currentView = lastView;
	var aCols = aVisibleCols;

	// clear all stored data
	resetCache(function(){

		// reload characters from server
		refreshData(function(){

			// reset charName and make sure it still exists					
			setCache('last-league',charName);
			setCache('last-view', currentView);
			setCache('inventoryCols',aCols);

			$('#leagueSelector li a[title="' + charName + '"]').trigger('click');				
		

		});

	});


});

$('#applyPartialRefresh').click(function(){

	var deleteQueue = new PromiseGroup();

	$('#refreshChars input[type=checkbox]:checked, #refreshTabs input[type=checkbox]:checked').each(function(idx,item){
		deleteQueue.addPromise( removeFromCache( $(item).val() ) );
	});

	deleteQueue.completed(function(){
		loadPageData();
	})




});

$('#partRefresh').click(function () {

	$('#refreshSelection').modal('show');

});

function refreshData(callback) {	

	$('#rareList').hide();
	$('div#crafting-content div.crafting-block').hide();
	$('ul.nav li,ul#craftingTabs li').removeClass('active');
	
	getCache('league-data')

		.done(function(oLeague) {			

			oLeagueChars = oLeague;

			getCache('oTabs').done(function(oT){

				oTabs = oT;			
				numTabs = oT.length;
				initPage();
				if(jQuery.isFunction(callback)) callback();					
			
			});

		})

		.fail(function(){

			$.blockUI({message: '<h3>Loading...</h3><h4 id="waitOnQueue"></h4>', baseZ: 10000});

			getChars()

				.done(function (charResp) {
					
					if (charResp == null || charResp.error != undefined) {
						showCharError();
						$.unblockUI();
						return;
					}

					// setCache('chars',charResp);

					var oLeagues = {};
					
					var loadQueue = new PromiseGroup();

					var throttleQueue = new PromiseGroup();					

					// we have to request each characters items to find out what league they are in
					$.each(charResp.characters,function(idx,item){
						
						loadQueue.addPromise(
							getCharItems(item.name)
								.done(function(oData){									
									if (oData.hasOwnProperty('character') && oData.character.hasOwnProperty('league')) {
										if (!oLeagues.hasOwnProperty(oData.character.league)) oLeagues[oData.character.league] = [];
										 oLeagues[oData.character.league].push(item.name);
									 }
								})
						);
						
					});

					// all items have been requested (ie not sitting in queue)
					throttleQueue.completed(function(){
						// when loading all chars is complete save to cache
						loadQueue.completed(function(){
							
							oLeagueChars = oLeagues;
							setCache('league-data', oLeagueChars);

							// look up how many tabs we have
							for(var league in oLeagues) {
							    if(oLeagues.hasOwnProperty(league)) {

							    	// load first leagues first stash tab to get tab info
							    	getStashPage(league,0)
							    		.done(function(oStash){

											oTabs = oStash.tabs;
											numTabs = oTabs.length;

											$.unblockUI();

											initPage();

											if(jQuery.isFunction(callback)) callback();

							    		})
							    	;

							        break;
							    }
							}


						});

					})

				})
				
				// failed to load character info
				.fail(function () {
					showCharError();
					$.unblockUI();
				})
			;
		})
	;

}

function getChars() {

	var deferred = new $.Deferred();

	$.get('http://www.pathofexile.com/')
		.done(function(data) {

			var regexp = new RegExp(/CHARACTERS_DATA=(\{.+?\});/g);
			var aMatch = regexp.exec(data);
			
			if (aMatch) {
				var cdata = JSON.parse(aMatch[1]);
				deferred.resolve(cdata);			
			} else {
				deferred.reject();
			}

		})
		.fail(function(){
			deferred.reject();
		})
	;

	return deferred.promise();

}

function initPage(){

	var oDD = $('#leagueSelector')
		.empty()		
	;

	for (var league in oLeagueChars) {
		oDD.append('<li><a title="' + league + '">' + league + '</a></li>');
	}

	sortUL(oDD);

	oDD.find('a').click(function(){

		var oThis = $(this);
		var league = oThis.text();

		currentLeague = league;

		oThis
			.closest('.dropdown')
				.addClass('active')
				.find('a.dropdown-toggle')
					.html(league + ' League <b class="caret"></b>')
		;

		oThis.parent().siblings().removeClass('active');

		oThis.parent().addClass('active');

		$('#output').html('');
		$('#rareList').html('');			

		if (league != '') {			
			setCache('last-league',league);
			loadLeagueData(league, false);	
		}

	});

}


function getVersion() {

	$.getJSON('manifest.json',function(manifest){
 		$('#version').html("Version: " + manifest.version);        
	});

}



function PromiseGroup() {

	var self = this;

	var aPromise = [];

	this.completed = function(fn) {
		$.when.apply($,aPromise).done(fn);
	}

	this.failed = function(fn) {
		$.when.apply($,aPromise).fail(fn);
	}

	this.addPromise = function(promise) {
		aPromise.push(promise);
	}


}


//constructor for a new throttle instance
function Throttle(periodDuration) {
	
	var self = this;

	this.period = periodDuration;
	
	this.delayQueue = [];
	this.currentRequest = null;
	this.completedRequests = 0;
	this.avTime = 0;
	this.countDown = null;
	this.ticks = 0;

	
	this.updateStatus = function(delay,undefined) {
		if (delay == undefined) delay = 0;
		var estRemaining = Math.round(((self.avTime * self.delayQueue.length) + delay) / 1000);
		if (estRemaining > 0) {
			$('#waitOnQueue').html("Estimated time remaining: " + estRemaining + ' seconds');
		} else {
			$('#waitOnQueue').empty();
		}
	};

	this.runRequest = function() {

		clearInterval(self.countDown);
		self.ticks = 0;

		if (!self.currentRequest) {
		 	if (self.delayQueue.length) {

				self.currentRequest = self.delayQueue.shift();

				var request = self.currentRequest.action;
				var deferred = self.currentRequest.deferred;
				var startTime = new Date().getTime();

				request()

					.done(function(result){

						if ( result.hasOwnProperty('error') ) {

							if (result.error.message.indexOf('too frequently') > -1) {
								self.delayQueue.push(self.currentRequest);	
								self.currentRequest = null;						
								self.updateStatus(self.period);								
								setTimeout(self.runRequest, self.period);
								self.countDown = setInterval(function(){
									self.updateStatus(self.period - (1000 * ++self.ticks));
								},1000);

							} else {
								console.log(typeof result.error.message);
								console.log('PoE website returned error:');
								console.log(result.error.message);
								deferred.reject();
								self.currentRequest = null;
								self.runRequest();
								self.updateStatus();							
							}


						} else {

							var endTime = new Date().getTime();
							self.avTime = ((self.avTime * self.completedRequests) + (endTime - startTime)) / ++self.completedRequests;

							deferred.resolve(result);
							self.currentRequest = null;
							self.runRequest();
							self.updateStatus();

						}

					})

					.fail(function(){
						deferred.reject();
						self.currentRequest = null;
						self.runRequest();
						self.updateStatus();
					})
				;

			} else {
			// reset stats as there are no active requests			
				this.completedRequests = 0;
				this.avTime = 0;			
			}
		}
	}
	
	// queues future calls to delay until the specified timeout (in milliseconds) has passed.
	// used to prevent flooding GGG's servers with too many stash requests in a short time.  
	this.queue = function(queued_action) {

		var deferred = $.Deferred();

		self.delayQueue.push({action: queued_action, deferred: deferred});
		
		if (!self.currentRequest) self.runRequest();

		return deferred.promise();

	};

	// self.updateStatus();

}



function showCharError() {
	$('#err').html('You appear not to be signed in to <a href="http://pathofexile.com">' +
				   'Path of Exile</a>.<p>Please sign in and refresh this page.');
}


function resetView() {

	// clear existing crafting info
	$('ul#craftingTabs li').remove();
	$('div#crafting-content').empty();
	
	//clear existing inventory info
	$('#rareList').empty();

	oTypes = {};
	oRarity = {normal: '', magic: '', rare: '', unique: '', skillGem: '', currency: ''};
	oProps = {};
	oRequired = {};
	oMods = {};
	oCalc = {};

	// clear reset lists
	$('#refreshChars, #refreshTabs, #craftingIgnoreChars, #craftingIgnoreTabs').empty();
	
	currentItems = null;

}

function loadLeagueData(league) {

	var oChecked = $('#refreshChars, #refreshTabs, #craftingIgnoreChars, #craftingIgnoreTabs').find('input[type=checkbox]:checked');
	
	resetView();

	var items = [];

	$.blockUI({message: '<h3>Loading...</h3><h4 id="waitOnQueue"></h4>', baseZ: 10000});

	try {

		var aChars = oLeagueChars[league];

		var loadQueue = new PromiseGroup();

		for (var i=0; i< aChars.length; i++) {		
			loadQueue.addPromise(
				getCharItems(aChars[i]).done(function(oChar){					
					$.merge(items, responseToItems(oChar, {section: oChar.charName, page: null, index: 0}))
				})
			);
			$('#refreshChars').append('<li><label class="checkbox"><input type="checkbox" name="refreshChars" id="char_' + aChars[i] + '" value="char-' + aChars[i] + '">' + aChars[i] + '</label></li>');
			$('#craftingIgnoreChars').append('<li><label class="checkbox"><input type="checkbox" id="ignoreChars_' + aChars[i] + '" name="ignoreChars" value="' + aChars[i] + '">' + aChars[i] + '</label></li>');
		}


		// get the first tab (and tab labels) first...		
		getStashPage(league,0).done(function(oData){

			try {
			
				oTabs = oData.tabs;
				numTabs = oTabs.length;
				$.merge(items, responseToItems(oData, {section: 'stash', page: parseInt(oTabs[oData.tabIndex].n), index:oData.tabIndex }))

			} catch (e) {

				$.unblockUI();
				$('#err').html('An error occured while requesting data from pathofexile.com. Please ' +
							   'select refresh then full to try again. If the error persists, contact the author.');
				console.log('Error while fetching from pathofexile.com - try clicking "Refresh Data"');
				errorDump(e);
			}				

		}).done(function(){

			try {

				for (var i=0; i < numTabs; i++ ) {
					$('#refreshTabs').append('<li><label class="checkbox"><input type="checkbox" name="refreshTabs" id="stash_' + oTabs[i].n + '" value="stash-' + league + '-' + i + '">Tab:' + parseInt(oTabs[i].n) + '</label></li>');
					$('#craftingIgnoreTabs').append('<li><label class="checkbox"><input type="checkbox" name="ignoreTabs" id="ignoreTabs_' + oTabs[i].n + '" value="' + parseInt(oTabs[i].n) + '">Tab:' + parseInt(oTabs[i].n) + '</label></li>');
				}

				// recheck anything that was checked before the load
				oChecked.each(function(idx,item){
					$('#' + $(item).attr('id')).prop('checked',true);
				})

				for (var i=1; i < numTabs; i++ ) {		
					loadQueue.addPromise(
						getStashPage(league,i).done(function(oData){													
							$.merge(items, responseToItems(oData, {section: 'stash', page: parseInt(oTabs[oData.tabIndex].n), index:oData.tabIndex }))
						})
					);
				}

				loadQueue.completed(function(){
					processItems(items)
						.done(function(){
							getCache('last-view')
								.done(function(selector){
									lastView = selector;
									$(selector).trigger('click');									
								})
								.fail(function(){
									$(lastView).trigger('click');									
								})
							;
						})
					;


					$.unblockUI();
				})

				loadQueue.failed(function(){		
					$('#err').html('An error occured while requesting data from pathofexile.com. Please ' +
								   'select refresh then full to try again. If the error persists, contact the author.');
					console.log('Error while fetching from pathofexile.com - try clicking "Refresh Data"');
					$.unblockUI();
				})

			} catch (e) {

				$.unblockUI();
				$('#err').html('An error occured while requesting data from pathofexile.com. Please ' +
							   'select refresh then full to try again. If the error persists, contact the author.');
				console.log('Error while fetching from pathofexile.com - try clicking "Refresh Data"');
				errorDump(e);
			}

		})
	
			
	} catch (e) {

		$.unblockUI();

		$('#err').html('An error occured while requesting data from pathofexile.com. Please ' +
					   'click refresh data to try again. If the error persists, contact the author.');
		console.log('Error while fetching from pathofexile.com - try clicking "Refresh Data"');

		errorDump(e);

	}


	
}


function responseToItems(response, location) {
	var items = []
	$.map(response.items, function (v) {

		// get the correct location for things outside stash
		var loc = location.page;	

		if (location.section !== 'stash') {
			loc = v.inventoryId === 'MainInventory' ? 'Inventory' : 'Equipped';
		}

		// add this item
		items.push(parseItem(v, {section: location.section, page: loc, tabIndex: location.index}));

		loc += '*';

		// get any socketed items and add them
		if (v.hasOwnProperty('socketedItems') && v.socketedItems.length) {			
			for (var i = 0; i < v.socketedItems.length; i++ ) {
				items.push(parseItem(v.socketedItems[i], {section: location.section, page: loc, tabIndex: location.index}));
			}
		} 
	})
	return items;
}


function getEndpoint(method) {
	return "http://www.pathofexile.com/character-window/" + method;
}



function getCharItems(charName) {


	var deferred = $.Deferred();
	
	// first attempt to load from cache
	getCache('char-' + charName)
		//cache hit
		.done(function(oData){
			deferred.resolve(oData);
		})

		// cache miss
		.fail(function(){

			var thisChar = charName;

			postThrottle.queue( function() { return $.post(getEndpoint('get-items'), {character: thisChar}) } )
				.done(function(oData){
					// add char data to cache
					oData.charName = thisChar;
					setCache('char-' + thisChar , oData);
					deferred.resolve(oData);
				})
				.fail(function(){
					deferred.reject();
					return;
				})
			;

					
		})
	;

	return deferred.promise();
}


// returns a promse, which will return the stash page once loaded
function getStashPage(league,index) {

	var deferred = $.Deferred();

	// first attempt to load from cache
	getCache('stash-' + league + '-' + index)
		//cache hit
		.done(function(oData){
			deferred.resolve(oData);
		})

		// cache miss
		.fail(function(){

			postThrottle.queue(function() { return $.post(getEndpoint('get-stash-items'), {league: league, tabIndex: index, tabs: index === 0 ? 1 : 0}) })
					
					.done(function (stashResp) {
						
						if(stashResp.error != undefined) {
							// early exit if web server returns the "you've requested too frequently" error
							deferred.reject();
							return;
						}	

						if (index === 0) {			    			
			    			setCache('oTabs',stashResp.tabs);							
						}

						stashResp.tabIndex = index;
						setCache('stash-' + league + '-' + index,stashResp);
						deferred.resolve(stashResp);
					})

					.fail(function(){
						deferred.reject();
						return;
					})
				;
			

		})
	;

	return deferred.promise();

}

