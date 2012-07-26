function dictMap(d, f) {
	var o = new Object();
	for (var i in d) {
		if (d.hasOwnProperty(i)) {
			o[i] = f(i, d[i]);
		}
	}
	return o;
}

function ttj(t) {
	return eval('(' + t + ')');
}


function parseError(item,message) {
	console.log(message);
	console.log(item);
}



var oTypes = {};
var oRarity = {normal: '', magic: '', rare: '', unique: '', skillGem: '', currency: ''};
var oProps = {};
var oRequired = {};
var oMods = {};
var oCalc = {};


function parseItem(rawItem, loc) {


	try{

		var item = {
			location: loc,
			rarity: '',
			name: $.trim(rawItem.name + ' ' + rawItem.typeLine),
			identified: true,
			properties: {},
			explicitMods: {},
			implicitMods: {},
			combinedMods: {},
			requirements: {},
			calculated: {Quantity: 1},
			rawItem: rawItem

		};

		// item rarity
		if (rawItem.hasOwnProperty('normal') && rawItem.normal) item.rarity = 'normal';
		else if (rawItem.hasOwnProperty('magic') && rawItem.magic) item.rarity = 'magic';
		else if (rawItem.hasOwnProperty('rare') && rawItem.rare) item.rarity = 'rare';
		else if (rawItem.hasOwnProperty('unique') && rawItem.unique) item.rarity = 'unique';
		else if (rawItem.hasOwnProperty('gem') && rawItem.gem) item.rarity = 'skillGem';
		else if (rawItem.hasOwnProperty('currency') && rawItem.currency) {
			item.rarity = 'currency';
			var aMatch = item.name.match(/^\s*(\d+)x\s+(.*)$/);
			if (aMatch) {
				item.calculated.Quantity = aMatch[1];
				item.name = aMatch[2] + ' x' + aMatch[1];
			}			
		} 		
		if (item.rarity == '') parseError(item,'unknown item rarity');

		item.baseType = itemBaseType(item);

		item.category = itemCategory(item.baseType);
		if(item.category == null)  parseError(item,'unknown item category');


		// get properties/mods/requirements into usable format
		if (rawItem.hasOwnProperty('requirements')) item.requirements = nameValueArrayToObj(rawItem.requirements,oRequired);

		// flasks and skillgems have some odd properties etc we don't want in the mix
		if (item.category !== 'skillGem' && item.rarity !== 'currency' && item.category != 'flask') {
			
			if (rawItem.hasOwnProperty('properties')) item.properties = nameValueArrayToObj(rawItem.properties,oProps);

			if (rawItem.hasOwnProperty('explicitMods')) item.explicitMods = processMods(rawItem.explicitMods,oMods);
			if (rawItem.hasOwnProperty('implicitMods')) item.implicitMods = processMods(rawItem.implicitMods,oMods);

			// combine explicit and implicit mods
			item.combinedMods = combineMods(item.explicitMods,item.implicitMods);

		}

		item.itemRealType = itemRealType(item);

		if (!oTypes.hasOwnProperty(item.itemRealType) && item.itemRealType != '') oTypes[item.itemRealType] = '';

		item.rareName = itemRareName(item);

		//console.log(item);

		/* 
		var itemDiv = $(rawData);
		var itemNameDiv = $('.itemName', itemDiv)[0]
		
		item = {
			name: itemName(itemNameDiv),
			location: loc,
			sockets: itemSockets($('.sockets', itemDiv)[0]),
			explicitModCount: $('div .explicitMod', itemDiv).length,
			raw: rawData
		};
		
		item.identified = $(':contains(Unidentified)', itemDiv).length == 0;
		item.rarity = itemRarity(itemNameDiv);
		item.baseType = itemBaseType(item);
		item.category = itemCategory(item);
		item.rareName = itemRareName(item);
		item.quality = itemQuality(itemDiv);
		item.quantity = itemQuantity(item);

		// rearrange the item name if there is a quantity in it (currency only?)
		if (item.rarity == 'currency' && item.quantity > 1) {
			item.name = item.name.replace(/^\s*(\d+)x\s*(.+?)\s*$/,'$2 ($1)');
		}

		*/

		// calculated properties
		item.calculated['Average Lightning Damage'] = getAverageDamageOfType(item,'Lightning Damage');
		item.calculated['Average Cold Damage'] = getAverageDamageOfType(item,'Cold Damage');
		item.calculated['Average Fire Damage'] = getAverageDamageOfType(item,'Fire Damage');
		item.calculated['Average Chaos Damage'] = getAverageDamageOfType(item,'Chaos Damage');
		item.calculated['Average Physical Damage'] = getAverageDamageOfType(item,'Physical Damage');		
		item.calculated['Average Damage'] = averageDamage(item);

		/*
		item.linkedSockets = getSocketLinkage(itemDiv);
		item.socketCount = item.sockets == null ? 0 : item.sockets.numSockets;
		*/

		// if the cacl'd properties cols aren't yet set, add them all
		if (!oCalc.hasOwnProperty('Average Damage')) {

			for (var key in item.calculated) {
				oCalc[key] = '';
			}
		}

	} catch(e) {

		console.log('Error parsing item from stash');
		console.log('Raw Item Data:');
		console.log(rawItem);
		console.log('Processed Item');
		console.log(item);

		errorDump(e);

		$('#err').html('An error occured while parsing an item in the stash. Please ' +
					   'click refresh to try again. If the error persists, contact the author.');		

	}	

//	item.prefixes = itemPrefixes(item);
//	item.suffixes = itemSuffixes(item);
	return item;
}

function nameValueArrayToObj(aPairs,oKeys){
	var max  = aPairs.length;	
	var oRet = {};
	for (var i = 0; i < max; i++){
		var val = aPairs[i].value;
		var key = aPairs[i].name;
		if (val[0] == '<') val = $(val).text();
		oRet[key] = val;		
		if (!oKeys.hasOwnProperty(key)) oKeys[key] = '';
	}	
	return oRet;
}


function itemCategory(baseType) {
	if (baseType in ITEM_TYPE_DATA) { return ITEM_TYPE_DATA[baseType]; }
	if (baseType in CURRENCY_DATA) { return CURRENCY_DATA[baseType]; }
	if (baseType.match(/\(Level \d+\)/i)) { return 'skillGem'; }
	if (baseType.match(/\b(?:flask|vial)\b/i)) { return 'flask'; }
	if (baseType.match(/\bquiver\b/i)) { return 'quiver'; }
	return null;
}


var oTop = {};
var oLeft = {};

function getSocketLinkage(itemDiv) {

	var aSockets = $(itemDiv).find('div.sockets img[src$="Socket_Link_Horizontal.png"], div.sockets img[src$="Socket_Link_Vertical.png"]');

	if (aSockets.length == 0) return 0;
	if (aSockets.length == 1) return 2;

	var nodes = {};

	var setMaxLink = function(num) {
		for (var i = 1; i <= num; i++) {
			nodes[i] = [i];
		}
	}
	
	var addLink = function(nodeSource,nodeTarget) {
		
		//console.log('joining ' + nodeSource + ' to ' + nodeTarget );
		
		var aMerged = union_arrays(nodes[nodeSource],nodes[nodeTarget]);
		
		for (var i= 0; i < aMerged.length; i++) {
			nodes[aMerged[i]] = aMerged;
		}			
		
	}

	setMaxLink(6);

	aSockets.each(function(index, item){

		item = $(item)
		
		var oLink = item.parent();
		var coords = oLink.attr('style').replace(/^.*top:(\d+).*left:(\d+).*$/,'($1,$2)')

		switch(coords) {

			case('(15,34)'):
				addLink(1,2);
				break;
			case('(62,34)'):
				addLink(3,4);
				break;
			case('(110,34)'):
				addLink(5,6);
				break;
			case('(34,15)'):
				addLink(1,3);
				break;
			case('(34,62)'):
				addLink(2,4);
				break;
			case('(82,15)'):
				addLink(3,5);
				break;
			case('(82,62)'):
				addLink(4,6);
				break;

			default:
				console.log('invalid coordinates for link: ' + coords);

		}

	});

	var maxlength = 0;

	for (var idx in nodes) {
		if (nodes[idx].length > maxlength) maxlength = nodes[idx].length;
	}

	return maxlength;

}


function union_arrays (x, y) {
  var obj = {};
  for (var i = x.length-1; i >= 0; -- i) obj[x[i]] = x[i];
  for (var i = y.length-1; i >= 0; -- i) obj[y[i]] = y[i];
  
  var res = []
  for (var k in obj) {
    res.push(obj[k]);
  }
  return res;
}


function averageDamage(item) {

	var dps = 0;

	var aTemp, aTemp2 = [];

	// if this is a weap, work it out as dps?
	if (item.properties.hasOwnProperty('Weapon Class')) {

		// physical
		aTemp = item.properties['Physical Damage'].split(' to ');

		dps += ( parseInt(aTemp[0]) + parseInt(aTemp[1]) ) / 2;
		if (item.properties.hasOwnProperty('Elemental Damage')) {

			aTemp = item.properties['Elemental Damage'].split(', ');

			aTemp2 = $.map(aTemp,function(range){				
				dps += calcAvRange(range);
			})

		}

		// for weaps multiply av dam by dps
		dps = Math.round(dps * parseFloat(item.properties['Attacks per Second']) * 10) / 10;

	} else {
		// not a weap, add up any elemental bonuses
		dps += item.calculated['Average Lightning Damage'];
		dps += item.calculated['Average Cold Damage'];
		dps += item.calculated['Average Fire Damage'];
		dps += item.calculated['Average Chaos Damage'];
		dps += item.calculated['Average Physical Damage'];
	}

	return dps;

}

function getAverageDamageOfType(item,mod) {
	var dps = 0;
	dps += item.combinedMods.hasOwnProperty(mod) ? calcAvRange(item.combinedMods[mod]) : 0;
	return dps;
}

function calcAvRange(range) {
	var aTemp2 = range.split('-');
	return ( parseInt(aTemp2[0]) + parseInt(aTemp2[1]) ) / 2;
}

// possibly need to combine an implicit + explicit mod.
function getPropertyOrModsInt(item,prop) {
	if (item.properties.hasOwnProperty(prop)) return item.properties[prop];

	var amt = 0;

	if (item.implicitMods.hasOwnProperty(prop)) amt += parseInt(item.implicitMods[prop]);
	if (item.explicitMods.hasOwnProperty(prop)) amt += parseInt(item.explicitMods[prop]);

	return amt;
}

function combineMods(explicitMods,implicitMods){

	var oCombined = {};
	for (var key in explicitMods) {
		oCombined[key] = explicitMods[key];
	}
	for (var key in implicitMods) {
		if (oCombined.hasOwnProperty(key)) {

			// can be int, % or range (x-y)
			var a = oCombined[key];
			var b = implicitMods[key];

			if (a.indexOf('-') > 0){
				// range
				a = a.split('-');
				b = b.split('-');
				oCombined[key] = (parseInt(a[0]) + parseInt(b[0])) + '-' + (parseInt(a[1]) + parseInt(b[1]));
			} else if (a.indexOf('%') > 0) {
				// percents
				a = parseInt(a.replace('%',''));
				b = parseInt(b.replace('%',''));
				oCombined[key] = a + b + '%';
			} else {
				oCombined[key] = parseInt(a) + parseInt(b);
			}

		} else {
			oCombined[key] = implicitMods[key];
		}
	}

	return oCombined;

}

function processMods(aExplicit,oKeys) {

	var oExplicit = {};

	var bonusRegexp =   /^\+?(\d+) [^A-Z]*(.*)$/;
	var percentRegexp = /^\+?(\d+%) [^A-Z]*(.*)$/;
	var damRegexp = /^Adds (\d+-\d+) (.* Damage)$/i;
	

	var aMatch = [];

	for(var i = 0; i < aExplicit.length; i++) {

		var thisMod = aExplicit[i];
		var key = '';

		aMatch = bonusRegexp.exec(thisMod);
		if (aMatch != null) {
			 key = aMatch[2];			 			
		} else {
			aMatch = percentRegexp.exec(thisMod);
			if (aMatch != null) { 
				key = '% ' + aMatch[2];
				
			} else {
				aMatch = damRegexp.exec(thisMod);
				if (aMatch != null) key = aMatch[2];
			}
		}

		if (aMatch != null) {
			oExplicit[key] = aMatch[1];
			if (!oKeys.hasOwnProperty(key)) oKeys[key] = '';
		}

	}

	return oExplicit;

}

function itemLevel(item) {

	if (item.requirements.hasOwnProperty('Required Level')) return parseInt(item.requirements['Required Level']);
	if (item.properties.hasOwnProperty('Required Level')) return parseInt(item.properties['Required Level']);

	if (item.category == 'skillGem') console.log(item);

	return 1;
}

function itemRealType(item){

	if (item.properties.hasOwnProperty('Weapon Class') ) {
		return item.properties['Weapon Class'];
	}

	if (item.rarity == 'currency') return 'Currency';
	
	if (item.category != null) return capitaliseFirstLetter(item.category);

	return '';

}

function itemRequirements(item) {
	return parseNameValuePairs( item.find('div.requirements span.lc span.name,div.requirements span.lc span.value') );
}

function itemProperties(item) {
	return parseNameValuePairs( item.find('div.displayProperty span.lc span.name,div.displayProperty span.lc span.value') );
}

function itemExplicitMods(item) {
	var aMods = [];
	item.find('div.explicitMod span.lc').each(function(idx,item){
		aMods.push($(item).text());
	});
	return aMods;
}

function itemImplicitMods(item) {
	var aMods = [];
	item.find('div.implicitMod span.lc').each(function(idx,item){
		aMods.push($(item).text());
	});
	return aMods;
}

function itemBaseType(item) {
	if (!item.identified || item.rarity == 'normal') { 
		return item.name; 
	}
	if (item.rarity == 'rare') {
		return item.name.split(' ').slice(2).join(' ');
	}
	if(item.rarity == 'currency') {
		return item.name.replace(/\s+x\d+$/,'');
	}
	if (item.rarity == 'magic') {
		// Split off the first word and everything after "of", these are suffix mods.
		var baseType = item.name.split(' ');
		var ofLocation = baseType.lastIndexOf('of');
		if (ofLocation > 0) {
			var suffixMod = baseType.slice(ofLocation).join(' ');
			if(suffixMod in MOD_SUFFIX_DATA) {
				// fine
			}
			else {
				console.log("Unrecognised suffixMod: " + suffixMod);
				console.log(item);
			}
			
			// remove the suffix mod
			baseType = baseType.slice(0,ofLocation);
			
		}
		else if(ofLocation==0) {
			console.log("Unexpected position of 'of' keyword");
			console.log(item);
		}

		// We first test if we've already got a base type.
		// this has to be done to prevent erroneous behaviour
		// when a prefix modifier begins with the same word as an item type. 
		// e.g. "Lacquered Lacquered Garb", "Studded Studded Round Shield", etc.
		var baseName = baseType.join(' ');
		if (baseName in ITEM_TYPE_DATA) {
			return baseName;
		}

		// now we test the first word against the known prefix list
		if(baseType[0] in MOD_PREFIX_DATA) {
			// if present, we strip it off
			baseType = baseType.slice(1);
		}


		
		// and retest against the known base type list.
		baseName = baseType.join(' ');
		if (baseName in ITEM_TYPE_DATA) {
			return baseName;
		}
		else {
			// at this point we SHOULD have a potion.
			// but we might also have an unrecognised prefix
			// or an unrecognised item basetype
			
			// we can reliably recognise a potion
			if(baseName.match(/\b(?:flask|vial)\b/i)) {
				// though if it's both a potion AND an unrecognised prefix we've got a problem. 
				return baseName;
			}
			
			// we can also test for unrecognised prefix by removing the first word and testing it against the known items
			var shorterName = baseType.slice(1).join(' ');
			if(shorterName in ITEM_TYPE_DATA) {
				console.log("Unrecognised prefixMod: " + baseType[0]);
				console.log(item);
				return shorterName;
			}

			// we must have an unrecognised  item type
			console.log("Unrecognised item type: " + baseName);
			console.log(item);

			return baseName;
		}
	}

	// TODO(jaguilar): handle uniques.
	return item.name;
}



function itemRareName(item) {
	if (item.rarity != 'rare' || !item.identified) { return null; }
	return item.name.split(' ').slice(0, 2).join(' ');
}

function itemSockets(sdiv) {
	if (sdiv == null) { return null; }
	var children = sdiv.children;
	var numSockets = 0;
	var maxConnected = 0;  // Max # in a connected seq.
	var numConnected = 0;  // Number of sockets in current connected seq.
	var colors = {red:false, green:false, blue:false};
	var connectionsLeft = 1;
	var tricolor = false;  // Any connected seqs with all three colors?
	for (var i = 0; i < children.length; ++i) {
		var child = children[i];
		if (connectionsLeft <= 0) {
			connectionsLeft = 1;
			numConnected = 0;
			colors.red = colors.green = colors.blue = false;
		}

		// If this is a connector, add a connection, otherwise remove one.
		if (child.className == '') {
			connectionsLeft += 1;
		} else if (child.className == 'clear') {
			break;
		} else {
			connectionsLeft -= 1;
			colors[socketColor($('img', child)[0])] = true;
			++numConnected;
			++numSockets;
			if (numConnected > maxConnected) { 
				maxConnected = numConnected; 
			}
			if (colors.red && colors.green && colors.blue) {
				tricolor = true;
			}
		}	
	}
	return {
		tricolor: tricolor,
		maxConnected: maxConnected,
		numSockets: numSockets
	};
}

function itemQuality(itemDiv) {
	var quality = $('.displayProperty', itemDiv).filter(':contains(Quality)');
	if (quality.length == 0) { return 0.0; }
	return Number(quality[0].innerText.split(' ')[1].trim().match(/\+(\d+)\%/i)[1]);
}

function itemByName(items, name) {
	return $(items.filter(function(i){return $(':contains(' + name + ')', $(i.html)).length > 0})[0].html)
}

function socketColor(simg) {
	var ctx = $('#tmpCanvas')[0].getContext('2d');
	ctx.clearRect(0, 0, 100, 100);
	ctx.drawImage(simg, 0, 0);
	var imageData = ctx.getImageData(0, 0, 100, 100);
	var sr = 0; var sg = 0; var sb = 0;
	for (var i = 0; i < imageData.width * imageData.height; i += 4) {
  		var r = imageData.data[i+0]; var g = imageData.data[i+1]; var b = imageData.data[i+2];
  		if (r == 0 && g == 0 && b == 0) { continue; }
  		else if (r > g && r > b) { sr += 1; }
  		else if (g > b) { sg += 1; }
  		else { sb += 1; }
	}
	if (sr > sg && sr > sb) { return 'red'; }
	else if (sg > sb) { return 'green'; }
	else { return 'blue'; }
}

