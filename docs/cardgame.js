const MAX_PROPERTIES = 5;
const MAX_CARDS = 32;
const API_URL = `https://query.wikidata.org/bigdata/namespace/wdq/sparql?format=json&query=`;

let statusField = undefined;
let typeLabel = undefined;
let type = undefined;
let lang = undefined;
let imageProgress = 0;
let deck
let highlight = 'yellow'

String.prototype.trunc = String.prototype.trunc ||
      function(n){
          return (this.length > n) ? this.substr(0, n-1) + '&hellip;' : this;
      };

function setStatus(text) {
    statusField.innerHTML = text;
}

function runQuery(query, callback) {
    query = query.replace(/%/g, "%25");
    query = query.replace(/&/g, "%26");

    window.fetch(API_URL+query).then(
        function (response) {
            if (response.status !== 200) {
                setStatus(`The query took too long or failed. This is probably a bug, let us know! (Status code: ${response.status})`);
                return;
            }
            response.json().then(function (data) {
                callback(data.results.bindings);
            });
        }
    ).catch(function (err) {
        setStatus('An error occurred while running the query: "'+err+'"');
    });
}

function preloadImage(url, totalCards) {
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.src = url;
        img.onload = function() {
            // An imageProgress of -1 indicates an error while async loading one of the images
            if(imageProgress < 0)
                return;

            imageProgress++;
            setStatus(gameTypeHTML()+" Preparing " + imageProgress + " of "+totalCards + " cards");
            return resolve();
        };
        img.onerror = function() {
            return reject("Error loading " + url);
        }
    });
}

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

function ordinal(i) {
    var j = i % 10,
        k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
}

// input format: 1772-01-01T00:00:00Z
function formatDate(date, precision) {
    if (precision >= 11) {
        return date.substring(0, 10);
    } else if (precision == 10) {
        return date.substring(0, 7);
    } else if (precision == 9) {
        return date.substring(0, 4);
    } else if (precision == 8) {
        return date.substring(0, 3)+"0s";
    } else if (precision == 7) {
        return ordinal(parseInt(date.substring(0, 2))+1)+" century";
    } else {
        return "a long time ago";
    }
}

function number_format(number, decimals, dec_point, thousands_sep) {
    // By Jonas Raoni Soares Silva, Kevin van Zonneveld, and others
    var n = !isFinite(+number) ? 0 : +number,
        prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
        sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
        dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
        toFixedFix = function (n, prec) {
            // Fix for IE parseFloat(0.55).toFixed(0) = 0;
            var k = Math.pow(10, prec);
            return Math.round(n * k) / k;
        },
        s = (prec ? toFixedFix(n, prec) : Math.round(n)).toString().split('.');
    if (s[0].length > 3) {
        s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
    }
    if ((s[1] || '').length < prec) {
        s[1] = s[1] || '';
        s[1] += new Array(prec - s[1].length + 1).join('0');
    }
    return s.join(dec);
}

function unitSimplify(text){
    text = text.replace(' per ','/');

    text = text.replace('kilogram','kg');
    text = text.replace('gram','g');

    text = text.replace('cubic metre','m^3');
    text = text.replace('square metre','m^2');
    text = text.replace('centimetre','cm');
    text = text.replace('square kilometre','km^2');
    text = text.replace('kilometre','km');
    text = text.replace('mile','mi');
    text = text.replace('metre','m');
    text = text.replace('millim','mm');
	
    text = text.replace('astronomical unit','au');
	
	text = text.replace('1','');
	
    return text;
}

function gameTypeHTML() {
    return `<a href="https://www.wikidata.org/wiki/${type}" class="id">${typeLabel}</a>`;
}

function buildDeck(results) {
    // Step 1: Get good property candidates.
    let propertiesCount = {};
    for (let line of results) {
        if (line.property.value in propertiesCount) {
            propertiesCount[line.property.value].items.push(line.item.value);
        } else {
            propertiesCount[line.property.value] = {items: [line.item.value], id: line.property.value, label: line.propertyLabel.value};
        }
    }

    let propertiesSorted = [];

    function onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }

    for (const property in propertiesCount) {
        propertiesSorted.push([property, propertiesCount[property].items.filter(onlyUnique).length, propertiesCount[property].label]);
    }

    propertiesSorted = propertiesSorted.sort((a,b) => b[1] - a[1]);
    //propertiesSorted = propertiesSorted.sort((a,b) => Math.random()+0.01);

    propertiesSorted = propertiesSorted.slice(0, MAX_PROPERTIES);

    // Step 2: Get items which as many of these properties as possible.
    let items = {};

    for (let line of results) {
        let valid = false;
        for (let property of propertiesSorted) {
            if (property[0] == line.property.value) {
                valid = true;
            }
        }

        if (valid) {
            let value = ""
            if (line.precision) {
                value = formatDate(line.valueLabel.value, line.precision.value);
				numValue = new Date(line.valueLabel.value).getTime()
            } else {
                let decimals = (Math.round(line.valueLabel.value) == +line.valueLabel.value) ? 0 : 2;
				let valueLabel = line.valueLabel.value
				let unitLabel = line.unitLabel && line.unitLabel.value ? line.unitLabel.value : ''
				if (unitLabel === 'mile') {
					unitLabel = 'km'
					valueLabel = `${parseFloat(valueLabel) * 1.6}`
				}
                value = number_format(valueLabel, decimals, ".", " ");
                if (unitLabel !== '' && line.unit.value != "http://www.entity/Q199") {
                    value += " "+unitSimplify(unitLabel); 
                }
				numValue = parseFloat(valueLabel)
            }
            if (line.item.value in items) {
            } else {
                items[line.item.value] = {item: line.item.value, label: line.itemLabel.value, properties: {}};
                if (line.image) {
                    items[line.item.value].image = line.image.value.replace('http://', 'https://')+'?width=1000';
                }else{
                    items[line.item.value].image = 'texture.png';
                }
                if (line.itemDescription) {
                    items[line.item.value].description = line.itemDescription.value;
                }
            }
            items[line.item.value].properties[line.propertyLabel.value] = {property: line.propertyLabel.value, value: value, numValue: numValue};
        }
    }

    let it = [];
    for (let item in items) {
        let i = items[item];
        i.known_properties = Object.keys(i.properties).length;

        let props = [];

        for (let property of propertiesSorted) {
            if (property[2] in i.properties) {
            } else {
                i.properties[property[2]] = {property: property[2], value: "-"};
            }
            props.push(i.properties[property[2]]);
        }

        i.properties = props;
        it.push(i);
    }

    it.sort((a,b) => b.known_properties - a.known_properties);
    it = it.slice(0, MAX_CARDS);

    return it;
}

function runDataQuery(restriction, lang) {
    let query = `
    SELECT ?item ?itemLabel ?itemDescription ?image ?property ?propertyLabel ?valueLabel ?unit ?unitLabel ?precision WITH {
      SELECT DISTINCT ?item WHERE {
        ${restriction}
        ?item wikibase:statements ?statements.
      }
      ORDER BY DESC(?statements)
      LIMIT 100
    } AS %items
    WHERE {
      INCLUDE %items.

      SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang}". }

      OPTIONAL { ?item wdt:P18 ?image. }

      ?item ?p ?statement.
      ?statement a wikibase:BestRank.

      ?property wikibase:claim ?p.
      ?property rdf:type wikibase:Property .

      {
        ?property wikibase:propertyType wikibase:Quantity.

        ?statement ?psn ?valueNode.
        ?valueNode wikibase:quantityAmount ?value.
        ?valueNode wikibase:quantityUnit ?unit.

        ?property wikibase:statementValue ?psn.
      } UNION {
        ?property wikibase:propertyType wikibase:Time.

        ?statement ?psn ?valueNode.
        ?valueNode wikibase:timeValue ?value.
        ?valueNode wikibase:timePrecision ?precision.

        ?property wikibase:statementValue ?psn.
      }
    }
    `;

    runQuery(query, results => {
        deck = buildDeck(results);
		console.log('deck', deck)
        imageProgress = 0;
        var promises = [];
        for (let card of deck) {
            promises.push(preloadImage(card.image, deck.length));
        }

        Promise.all(promises).then(function() {
            // for (let card of deck) {
//                 genCardHTML(card);
//             }
			genCardHTML(deck[Math.round(Math.random() * (deck.length - 1))], deck[Math.round(Math.random() * (deck.length - 1))])
            setStatus(gameTypeHTML() + " Play!");
        }, function(err) {
            imageProgress = -1;
            setStatus("An error occurred while generating the cards: " + err);
        });
    });
}

function genCardHTML(data, data2){
    let cardsDiv = document.getElementById("cards");
				
    var link = document.createElement('a');
    link.href = data.item;
    //cardsDiv.appendChild(link);

    var card = document.createElement('div');
    card.className = 'card'; 
	
    //link.appendChild(card);
	cardsDiv.appendChild(card);

    card.style.backgroundImage = 'url('+data.image+')';


    var headerdiv = document.createElement('div')
    headerdiv.className = 'header'
	headerdiv.style.cursor = 'pointer'
	headerdiv.onclick = () => window.open(data.item, 'blank')
    card.appendChild(headerdiv);

    var titlediv = document.createElement('div');
    titlediv.className = 'title';
    headerdiv.appendChild(titlediv);
    titlediv.innerHTML = data.label.capitalize();

    if(data.description){
        var descriptiondiv = document.createElement('div');
        descriptiondiv.className = 'description';
        headerdiv.appendChild(descriptiondiv);
        descriptiondiv.innerHTML = data.description.capitalize();
    }

    var space = document.createElement('div');
    space.className = 'space';
    card.appendChild(space);
	let isDone = false
    for(let property in data.properties){
        let propdiv = document.createElement('div');
        propdiv.className = 'prop';
		propdiv.style.cursor = 'pointer'
		if (property === data.setProperty) {
			propdiv.style.backgroundColor = highlight
			delete data.setProperty
		}
		propdiv.onclick = () => {
			if (isDone || !data2) {
				cardsDiv.innerHTML = ""
				genCardHTML(deck[Math.round(Math.random() * (deck.length - 1))], deck[Math.round(Math.random() * (deck.length - 1))])
			} else {
				propdiv.style.backgroundColor = highlight
				data2.setProperty = property
				var sign = document.createElement('span');
				sign.style.fontSize = '6em'
				sign.style.color = 'violet'
				sign.innerHTML = data.properties[property].numValue > data2.properties[property].numValue ? "&gt;" : (data.properties[property].numValue < data2.properties[property].numValue ? "&lt;" : "=")
				cardsDiv.appendChild(sign)
				genCardHTML(data2)
				isDone = true
			}
		}
        card.appendChild(propdiv);

        var propnamediv = document.createElement('div');
        propdiv.appendChild(propnamediv);
        propnamediv.innerHTML = data.properties[property].property.capitalize();
        var propvaluediv = document.createElement('div');
        propdiv.appendChild(propvaluediv);
        propvaluediv.innerHTML = data.properties[property].value;
    }

    //var qdiv = document.createElement('div');
    // qdiv.className = 'qnr';
    // card.appendChild(qdiv);
    // qdiv.innerHTML = data.item;
}

function populateLanguageOptions() {
    const langQuery = `
    SELECT ?item ?code ?itemLabel (GROUP_CONCAT(?nativeLabel;separator="/") as ?nativeLabels) WHERE {
      ?item wdt:P424 ?code.
      ?item wdt:P1705 ?nativeLabel.

      MINUS { ?item (wdt:P31/wdt:P279*) wd:Q14827288. }
      MINUS { ?item (wdt:P31/wdt:P279*) wd:Q17442446. }
      MINUS { ?item wdt:P279+ wd:Q1860. }
      FILTER(?item != wd:Q22282939 && ?item != wd:Q22282914)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?item ?code ?itemLabel
    ORDER BY ?itemLabel
    `;
    runQuery(langQuery, results => {
        let select = document.querySelector("select");
        for (let line of results) {
            let option = document.createElement("option");
            option.innerHTML = `${line.itemLabel.value} (${line.code.value}) – ${line.nativeLabels.value}`.trunc(40);
            option.value = line.code.value;
            select.appendChild(option);
        }
        document.querySelector("#topic").value = type;
        document.querySelector("#lang").value = lang;
    });
}

function submitQuery(e) {
    e.preventDefault();
    console.log("hi");
    window.location = `./?${document.querySelector("#topic").value}&lang=${document.querySelector("#lang").value}`;
    return false;
}

let topics = ["Q11344", "Q5503", "Q23442", "Q1032372", "Q55990535", "Q35273", "Q142714"]
window.onload = function() {
    var searchParams = new URLSearchParams(window.location.search)
    lang = searchParams.get("lang") || "en";
    var match = window.location.search.match(/Q\d+/g);
    type = match && match[0] || topics[Math.round(Math.random() * (topics.length - 1))];

    statusField = document.getElementById("status");

    populateLanguageOptions();

    const typeNameQuery = `
    SELECT ?itemLabel WHERE {
      BIND(wd:${type} as ?item)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang}". }
    }
    `;
    runQuery(typeNameQuery, results => {
        typeLabel = results[0].itemLabel.value;
        setStatus(gameTypeHTML() + " Generating...");

        var restriction = `?item (wdt:P31|wdt:P106|wdt:P39)/(wdt:P279*|wdt:P171*) wd:${type}.`;
        runDataQuery(restriction, lang);
    });
}
