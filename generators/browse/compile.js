#!/usr/bin/env node

/**
	compiles the data file for the browse interface
**/

String.prototype.expand = function() {
	return this.toString().replace(/([hrcaspit])/g, function(l){
		switch (l) {
			case "h": return "|Title "; break;
			case "r": return "|Recital "; break;
			case "c": return "|Chapter "; break;
			case "s": return "|Section "; break;
			case "a": return "|Article "; break;
			case "p": return "|Paragraph "; break;
			case "i": return "|Point "; break;
			case "t": return "|Text "; break;
		}
	}).replace(/^\|/,'').split(/\|/g).join(" – ");
};

var fs = require("fs");
var path = require("path");
var colors = require("colors");
var argv = require("optimist")
	.boolean(['d'])
	.alias("d","debug")
	.argv;

/* get config */
var config = require(path.resolve(__dirname, '../../config.js'));

var _directive = JSON.parse(fs.readFileSync(path.resolve(config.datadir, 'directive.json')));
var _amendments = JSON.parse(fs.readFileSync(path.resolve(config.datadir, 'amendments.json')));
var _proposals = JSON.parse(fs.readFileSync(path.resolve(config.datadir, 'proposals.json')));

var _mep = JSON.parse(fs.readFileSync(path.resolve(config.datadir, 'mep.json')));
var _mep_groups = JSON.parse(fs.readFileSync(path.resolve(config.datadir, 'groups.json')));
var _countries = JSON.parse(fs.readFileSync(path.resolve(config.datadir, 'countries.json')));

var _patterns = {};
var _list = [];
var _data = {};

_amendments.forEach(function(_amd, _idx){
	_amd.relations.forEach(function(_pat){
		if (!(_pat in _patterns)) _patterns[_pat] = [];
		_patterns[_pat].push({
			"type": "a", "uid": _idx
		});
	});
});

_proposals.forEach(function(_prop, _idx){
	_prop.patterns.forEach(function(_pat){
		if (!(_pat in _patterns)) _patterns[_pat] = [];
		_patterns[_pat].push({
			"type": "p", "uid": _idx
		});
	});
});

function _tree(_parent, _level, _title) {

	if (typeof _level === 'undefined') {
		var _level = 0;
	} else {
		_level++;
	}

	if (typeof _title === 'undefined') {
		var _title = [];
	}

	_directive.forEach(function(_dir){
		
		if (_dir.parent === _parent) {
			
			/* insert item */
			
			var _item = {
				"id": _dir.id,
				"type": _dir.type,
				"title": "",
				"longtitle": "",
				"literal": _dir.literal,
				"level": _level,
				"children": _dir.children,
				"parent": ((_dir.parent === '_') ? null : _dir.parent),
				"text": _dir.text,
				"proposals": [],
				"amendments": [],
				"prev": null,
				"next": null
			};
			
			switch(_item.type) {
				case "title": _item.title = "Titel"; break;
				case "recital": _item.title = "Präambel "+_item.literal; break;
				case "chapter": _item.title = "Kapitel "+_item.literal; break;
				case "section": _item.title = "Abschnitt "+_item.literal; break;
				case "article": _item.title = "Artikel "+_item.literal; break;
				case "paragraph": _item.title = "Paragraph "+_item.literal; break;
				case "point": _item.title = "Punkt "+_item.literal; break;
				case "introduction": _item.title = "Einführung"; break;
				case "subparagraph": _item.title = "Text"; break;
				default:
					console.log(_item.type);
					process.exit();
				break;
			}
			
			_title.push(_item.title);
			_item.longtitle = _title.join(', ');
			
			_list.push(_item);
			
			_tree(_dir.id, _level, _title);
			
			_title.pop();
			
			if (_dir.id+'+' in _patterns) {
				
				// insert addition
				
				_list.push({
					"id": _dir.id+'+',
					"type": 'addition',
					"title": _item.title,
					"longtitle": _item.longtitle,
					"literal": null,
					"level": _level,
					"children": [],
					"parent": ((_dir.parent === '_') ? null : _dir.parent),
					"text": null,
					"proposals": [],
					"amendments": [],
					"prev": null,
					"next": null
				});
				
			}
			
			
		}
		
	});
	
}

_tree('_');

var _max = {
	"amendments": 0,
	"proposals": 0,
	"total": 0
};

/* compile list into object */

_list.forEach(function(_item, _idx){

	/* prev and next */
	if (_idx > 0) _item.prev = _list[(_idx-1)].id;
	if (_idx < (_list.length-1)) _item.next = _list[(_idx+1)].id;

	_item.stat = {
		"num": {
			"amendments": 0,
			"proposals": 0,
			"total": 0
		},
		"perc": {
			"amendments": 0,
			"proposals": 0,
			"total": 0
		}
	}

	/* amendments and proposals */
	if (_item.id in _patterns) {
		_patterns[_item.id].forEach(function(_pat){
			switch(_pat.type) {
				case "a": 
					_item.amendments.push(_amendments[_pat.uid]); 
					_item.stat.num.amendments++;
				break;
				case "p": 
					_item.proposals.push(_proposals[_pat.uid]); 
					_item.stat.num.proposals++;
				break;
			}
			_item.stat.num.total++;
		});
	}
	
	
	_item.amendments.forEach(function(_amendment){

		/* refine amendment meps */
		var _authors = [];
		_amendment.author_ids.forEach(function(_author_id){
			if (!(_author_id in _mep)) {
				console.error('ERR!'.inverse.red.bold, _author_id, _amendment.authors);
				process.exit(1);
			}
			_authors.push({
				"name": _mep[_author_id].name,
				"country": _mep[_author_id].country,
				"country_long": _countries[_mep[_author_id].country],
				"group": _mep_groups[_mep[_author_id].group].short,
				"group_long": _mep_groups[_mep[_author_id].group].long
			});
		});
		_amendment.authors = _authors;
		
		/* put the diff of the first text element to the amendment root, 
			since mustache cannot iterate arrays well */
		_amendment.diff = _amendment.text[0].diff;

	});
	
	/* statistics */
	if (_item.stat.num.amendments > _max.amendments) _max.amendments = _item.stat.num.amendments;
	if (_item.stat.num.proposals > _max.proposals) _max.proposals = _item.stat.num.proposals;
	if (_item.stat.num.total > _max.total) _max.total = _item.stat.num.total;
	
	/* check for addition */
	_item.addition = (_item.type === 'addition') ? true : false;

	_item.has_children = (_item.children.length > 0) ? true : false;
	
});

_list.forEach(function(_item, _idx){
	
	_item.stat.perc.amendments = (_item.stat.num.amendments/_max.amendments).toFixed(3);
	_item.stat.perc.proposals = (_item.stat.num.proposals/_max.proposals).toFixed(3);
	_item.stat.perc.total = (_item.stat.num.total/_max.total).toFixed(3);
	
	var _text = _item.text;
	_item.text = [];
	for (_lang in _text) {
		_item.text.push({lang:_lang,text:_text[_lang]});
	}
	
	_data[_item.id] = _item;
	
});

for (_id in _data) {
	(function(){
		var _item = _data[_id]
		if (_item.prev !== null) {
			_item.prev = {
				"id": _item.prev,
				"title": _data[_item.prev].title
			};
		}
		if (_item.next !== null) {
			_item.next = {
				"id": _item.next,
				"title": _data[_item.next].title
			};
		}
		if (_item.parent !== null) {
			_item.parent = {
				"id": _item.parent,
				"title": _data[_item.parent].title
			};
		}
		var _children = [];
		_item.children.forEach(function(_child){
			_children.push({
				"id": _child,
				"title": _data[_child].title
			});
		});
		_item.children = _children;
	})();
}

if (argv.d) {
	fs.writeFileSync('debug-compiled.json', JSON.stringify(_data,null,'\t'));
} else {
	fs.writeFileSync(path.resolve(config.frontenddir, 'browse/assets/data/compiled.json'), JSON.stringify(_data,null,'\t'));
}

/* generate list */
var _list_html = [];

_list_html.push('<h2>Durch die Datenschutz-Grundverordnung stöbern</h2>')
_list_html.push('<p>Mit diesem Tool kannst Du durch alle Teile der <abbr title="Datenschutz-Grundverordnung (General Data Protection Regulation)">GDPR</abbr> in 23 Sprachen stöbern und dir verschiedene Änderungsanträge, sowie Lobby-Vorschläge ansehen.</p>')
_list_html.push('<table class="table index-list"><thead><tr><th>Teil der Grundverordnung</th><th>Änderungsanträge</th><th>Lobby-Vorschläge</th></tr></thead><tbody>');
_list.forEach(function(_item){
	_list_html.push('<tr>');
	_list_html.push('<td><a href="/show/'+(_item.id)+'" style="margin-left:'+(_item.level*15)+'px">');
	if (_item.type === 'addition') {
		_list_html.push('+ New part');
	} else {
		_list_html.push(_item.title);
	}
	_list_html.push('</a></td>');
	_list_html.push('<td>'+(_item.amendments.length)+'</td>');
	_list_html.push('<td>'+(_item.proposals.length)+'</td>');
	_list_html.push('</tr>');
});
_list_html.push('</tbody></table>');

if (argv.d) {
	fs.writeFileSync('debug-list.mustache', _list_html.join(''));
} else {
	fs.writeFileSync(path.resolve(config.frontenddir, 'browse/assets/tmpl/list.mustache'), _list_html.join(''));
}

/* generate indicator */
var _indicator_html = [];

_list.forEach(function(_item,_num){
//	var _left = (_num/_data.length).toFixed(2);
//	var _width = (100/_data.length).toFixed(2);
	var _color = (((_item.stat.perc.proposals-_item.stat.perc.amendments)*100)+0).toFixed(2);
	var _opacity = (_item.stat.perc.total*3).toFixed(2);
	var _label = (_item.type === 'addition') ? '+ New part after '+_item.longtitle : _item.longtitle;
	var _label_am = _item.stat.num.amendments;
	var _label_pr = _item.stat.num.proposals;
	var _id = _item.id;

	/* max opacity at 1 */
	_opacity = (_opacity > 1) ? 1 : _opacity;

	_indicator_html.push([
		'<li>',
		'<a href="/show/'+_id+'" style="background-color:hsla('+_color+',100%,50%,'+_opacity+')">',
		'<span class="meta">'+_label+' ('+_label_am+'/'+_label_pr+')</span>',
		'</a>',
		'</li>'
	].join(''));
});
_indicator_html = '<ul id="directive-items">\n\t'+(_indicator_html.join('\n\t'))+'\n</ul>';

if (argv.d) {
	fs.writeFileSync('debug-indicator.mustache', _indicator_html);
} else {
	fs.writeFileSync(path.resolve(config.frontenddir, 'browse/assets/tmpl/indicator.mustache'), _indicator_html);
}

console.error(' <3 '.inverse.bold.magenta, 'made with datalove'.bold.magenta);
process.exit(0);
