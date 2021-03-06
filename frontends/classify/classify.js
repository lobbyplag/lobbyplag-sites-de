var path = require('path')
	, fs = require('fs')
	, mustache = require('mustache')
	, express = require('express')
	, passport = require('passport')
	, LocalStrategy = require('passport-local').Strategy;

var config = require(path.resolve(__dirname, './config.js'));

/* login-users */

var users = [
	{ id: 1, username: 'lobbyplag', password: 'vorhalle' }
];

function findById(id, fn) {
	var idx = id - 1;
	if (users[idx]) {
		fn(null, users[idx]);
	} else {
		fn(new Error('User ' + id + ' does not exist'));
	}
}

function findByUsername(username, fn) {
	for (var i = 0, len = users.length; i < len; i++) {
		var user = users[i];
		if (user.username === username) {
			return fn(null, user);
		}
	}
	return fn(null, null);
}

passport.serializeUser(function (user, done) {
	done(null, user.id);
});

passport.deserializeUser(function (id, done) {
	findById(id, function (err, user) {
		done(err, user);
	});
});

passport.use(new LocalStrategy(
	function (username, password, done) {
		// asynchronous verification, for effect...
		process.nextTick(function () {

			// Find the user by username. If there is no user with the given
			// username, or the password is not correct, set the user to `false` to
			// indicate failure and set a flash message. Otherwise, return the
			// authenticated `user`.
			findByUsername(username, function (err, user) {
				if (err) {
					return done(err);
				}
				if (!user) {
					return done(null, false, { message: 'Unknown user ' + username });
				}
				if (user.password != password) {
					return done(null, false, { message: 'Invalid password' });
				}
				return done(null, user);
			})
		});
	}
));

/* configure Express */

var app = express();

app.configure(function () {
	app.use(express.cookieParser());
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.session({ secret: 'keyboard cat is sad' }));
	app.use(passport.initialize());
	app.use(passport.session());
	app.use("/assets", express.static(path.resolve(__dirname, '../assets')));
	app.use(express.favicon(__dirname + '../assets/img/favicon.ico'));
	app.use(express.logger());
	app.use(app.router);
});

/* read template */
var tmpl = {
	index: fs.readFileSync(path.resolve(__dirname, "tmpl/index.mustache")).toString(),
	login: fs.readFileSync(path.resolve(__dirname, "tmpl/user.mustache")).toString(),
	tgc: fs.readFileSync(path.resolve(__dirname, "tmpl/tgc.mustache")).toString()
};
var cats_filename = path.resolve(__dirname, 'data', "cats.json");
var classify_filename = path.resolve(__dirname, 'data', "classified.json");
var tagcats_filename = path.resolve(__dirname, config.datadir, "categories.json");
var amendments_filename = path.resolve(__dirname, config.datadir, "amendments.json");

/* categories */
var tagcats = JSON.parse(fs.readFileSync(tagcats_filename).toString());
tagcats.forEach(function (cat) {
	cat.name = cat.text.en.short;
	cat.hint = cat.text.en.title;
	cat.desc = cat.text.en.description;
});

/* cached cats */
var cats = [];

function initCats() {
	fs.exists(cats_filename, function (exists) {
		if (exists) {
			cats = JSON.parse(fs.readFileSync(cats_filename).toString());
		}
	});
}
initCats();

var save_cats = function () {
	fs.writeFileSync(cats_filename, JSON.stringify(cats, null, '\t'));
};

/* amendments */
var amendments = JSON.parse(fs.readFileSync(amendments_filename).toString());
var amendments_index = {};
var amendments_by_ids = {};

function amendmentsByNumber(number) {
	for (var i = 0; i < amendments.length; i++) {
		if (amendments[i].number === number)
			return amendments[i];
	}
	return null;
}

function findClassifiedByID(uid, list) {
	for (var i = 0; i < list.length; i++) {
		if (list[i].uid === uid)
			return list[i];
	}
	return null;
}


function initAmendments() {
	var _mep = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'mep.json')));
	var _mep_groups = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'groups.json')));
	var _countries = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'countries.json')));

	amendments = amendments.filter(function (amed) {
		return amed.committee === 'libe';
	});

	amendments.sort(function (a, b) {
		if (a.committee === b.committee) {
			if (a.number < b.number)
				return -1;
			if (a.number > b.number)
				return 1;
			return 0;
		}
		if (a.committee < b.committee)
			return -1;
		return 1;
	});

	var ranges = [];
	var _start = 0;
	var _last = 0;

	amendments.forEach(function (_amend, idx) {
		if (_start === 0)
			_start = _amend.number;
		if (_last + 1 !== _amend.number) {
			ranges.push({from: _start, to: _last});
			_start = _amend.number;
			_last = _amend.number;
		} else {
			_last = _amend.number;
		}

		amendments_by_ids[_amend.uid] = _amend;
		var _authors = [];
		_amend.author_ids.forEach(function (_author_id) {
			if ((_author_id in _mep)) {
				_authors.push({
					"uid": _author_id,
					"name": _mep[_author_id].name,
					"country": _mep[_author_id].country,
					"country_long": _countries[_mep[_author_id].country],
					"group": _mep_groups[_mep[_author_id].group].short,
					"group_id": _mep[_author_id].group,
					"group_long": _mep_groups[_mep[_author_id].group].long,
					"full": _mep[_author_id]
				});
			} else {
				console.log('Author ' + _author_id + 'not found :.(');
			}
		});
		_amend.authors = _authors;
		amendments_index[_amend.uid] = idx + 1//avoid 0;
	});
	ranges.push({from: _start, to: _last});

	console.log('available AMs:')
	console.log(ranges);

}
initAmendments();

/* classified */
var classified = [];
var classified_by_users_and_ids = {};

function initClassification(cb) {
	fs.exists(classify_filename, function (exists) {
		if (exists) {
			classified = JSON.parse(fs.readFileSync(classify_filename).toString());
			classified.forEach(function (_classi) {
				classified_by_users_and_ids[_classi.user] = classified_by_users_and_ids[_classi.user] || {};
				classified_by_users_and_ids[_classi.user][_classi.uid] = _classi;
			});
		} else
			console.log('meh classified not found');
		cb();
	});
}

var save_classified = function () {
	fs.writeFileSync(classify_filename, JSON.stringify(classified, null, '\t'));
};

initClassification(function () {
});


/* tools */

var parcelNavig = function (index, user) {
	var _navig = {};
//	console.log('Parcel:Index: ' + index);
//	if (index > 0)
//		console.log('Parcel:num-1: ' + amendments[index - 1].number);
//	console.log('Parcel:num: ' + amendments[index].number);
//	console.log('Parcel:num+1: ' + amendments[index + 1].number);

	if ((index >= 0) && (index < amendments.length))
		_navig.id = amendments[index].uid;
	if ((index > 0) && (index < amendments.length)) {
		_navig.prev = amendments[index - 1].uid;
	} else {
		_navig.prev = amendments[amendments.length - 1].uid;
	}
	if ((index >= 0) && (index + 1 < amendments.length )) {
		_navig.next = amendments[index + 1].uid;
	} else {
		_navig.next = amendments[0].uid
	}
	if (index < amendments.length) {
		for (var i = index - 1; i >= 0; i--) {
			if ((!classified_by_users_and_ids[user]) || (!classified_by_users_and_ids[user][amendments[i].uid])) {
				_navig.prev_unchecked = amendments[i].uid;
				break; //we're done
			}
		}
	}
	if (index >= 0) {
		for (var i = index + 1; i < amendments.length; i++) {
			if ((!classified_by_users_and_ids[user]) || (!classified_by_users_and_ids[user][amendments[i].uid])) {
				_navig.next_unchecked = amendments[i].uid;
				break; //we're done
			}
		}
	}
	return _navig;
};

String.prototype.expand = function () {
	return this.toString().replace(/([hrcaspit])/g,function (l) {
		switch (l) {
			case "h":
				return "|Title ";
				break;
			case "r":
				return "|Recital ";
				break;
			case "c":
				return "|Chapter ";
				break;
			case "s":
				return "|Section ";
				break;
			case "a":
				return "|Article ";
				break;
			case "p":
				return "|Paragraph ";
				break;
			case "i":
				return "|Point ";
				break;
			case "t":
				return "|Text ";
				break;
		}
	}).replace(/^\|/, '').split(/\|/g).join(" – ");
};

var sendAmendment = function (res, index, user) {
	var _amend = amendments[index];
	if (!_amend) {
		res.json([]);
		return;
	}

	var _laws = [];
	_amend.relations.forEach(function (_relation) {
		_laws.push({
			url: 'http://lobbyplag.eu/browse/show/' + _relation,
			name: _relation.expand()
		});
	});

	var _parcel = {};
	_parcel.navig = parcelNavig(index, user);
	_parcel.amend = _amend;
	_parcel.user = user;
	_parcel.laws = _laws;
	_parcel.cats = cats;

	var donecount = 0;
	if (classified_by_users_and_ids[user]) {
		for (var key in classified_by_users_and_ids[user]) {
			donecount++;
		}
	}
	_parcel.unchecked = donecount;
	_parcel.total = amendments.length;

	var _others = [];
	for (var key in classified_by_users_and_ids) {
		if ((key !== user) && (classified_by_users_and_ids[key][_amend.uid])) {
			_others.push(classified_by_users_and_ids[key][_amend.uid]);
		}
	}
	_parcel.others = _others;
	if ((!classified_by_users_and_ids[user]) || (!classified_by_users_and_ids[user][_amend.uid])) {
		_parcel.classified = {vote: 'fehlt'};
	} else {
		_parcel.classified = classified_by_users_and_ids[user][_amend.uid] || {vote: 'fehlt'};
	}
	res.json(_parcel);
};

var getIndexOfAmendmentByNumber = function (nr) {
	for (var i = 0; i < amendments.length; i++) {
		if (amendments[i].number === nr) {
			return i;
		}
	}
	return -1;
};

var getIndexOfAmendment = function (id) {
	return (amendments_index[id] || 0) - 1; //0 is avoided in array
};

/* save data on sigint */
process.on('SIGINT', function () {
	console.log('Caught SIGINT');
	save_classified();
	process.exit();
});

/* handle uncaught exception, just in case */
process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
});

/* index (or login) */
app.get(config.prefix, function (req, res) {
	var content = "";
	if (req.user) {
		content = mustache.render(tmpl.index, {
			urlprefix: config.prefix,
			tagcats: tagcats
		}, {
			"tgc": tmpl.tgc
		});
	} else {
		content = mustache.render(tmpl.login, {
			urlprefix: config.prefix
		}, {
			"tgc": tmpl.tgc
		});
	}
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.send(content);
});

app.get(config.prefix + '/rawdata', function (req, res) {
	if (req.user) {
		var result = classified.map(function (_entry) {
			var _amend = amendments_by_ids[_entry.uid];
			var obj = {
				user: _entry.user,
				uid: _entry.uid,
				nr: _amend.number,
				committee: _amend.committee,
				vote: _entry.vote,
				comment: _entry.comment,
				topic_id: _entry.topic,
				category: _entry.category,
				conflictcharta: _entry.conflict
			};
			return obj;
		});
		res.json(result);
	} else {
		return res.redirect(config.prefix);
	}
});
function cvsify(s) {
	s = s || '';
	if (isNaN(s)) {
		if (s.indexOf(';') >= 0) {
			s = '"' + s.replace('"', '""') + '"';
		}
		return s.replace("\n", ' ');
	} else {
		return String(s);
	}
}

app.get(config.prefix + '/compare', function (req, res) {
	if (req.user) {
		var classified_data_two = classified.filter(function (c) {
			return c.user === 'EDRI';
		});
		var classified_data_msone = classified.filter(function (c) {
			return c.user === 'MS';
		});
		var result = [];
		amendments.forEach(function (amendment) {
			var userone = findClassifiedByID(amendment.uid, classified_data_msone);
			if (userone) {
				var usertwo = findClassifiedByID(amendment.uid, classified_data_two);
				if (usertwo) {
					var _meps = amendment.authors.map(function (m) {
						return m.name;
					}).join(', ');
					result.push(cvsify(amendment.uid) + ';' + cvsify((amendment.relations[0] || '').expand()) + ';' +
						cvsify(_meps) + ';' + cvsify(userone.category) + ';' + amendment.number + ';' + cvsify(userone.vote) + ';' + cvsify(usertwo.vote) + ';' + (userone.vote !== usertwo.vote));
				}
			}
		});
		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		res.send(result.join("\n"));
	} else {
		return res.redirect(config.prefix);
	}
});


app.get(config.prefix + '/overviewmeps', function (req, res) {
	if (req.user) {
		var raw_constituencies = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'constituencies.json')));
		var raw_meps = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'mep.json')));
		var raw_countries = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'countries.json')));
		var raw_groups = JSON.parse(fs.readFileSync(path.resolve(__dirname, config.datadir, 'groups.json')));
		var classified_data_msone = classified.filter(function (c) {
			return c.user === 'MS';
		});
		var result = [];
		result.push(
			'id;' +
				'title;' +
				'firstname;' +
				'surname;' +
				'salutation;' +
				'email;' +
				'country;' +
				'country_id;' +
				'group;' +
				'group_id;' +
				'party_id;' +
				'party_short;' +
				'party_long;' +
				'vote_stronger;' +
				'vote_weaker;' +
				'vote_neutral;' +
				'rating;'
		);
		for (var key in raw_meps) {
			var _mep = raw_meps[key];
			var _con = "";
			var _conshort = "";
			var locals_parties = raw_constituencies[_mep.country];
			for (var i = 0; i < locals_parties.length; i++) {
				if (locals_parties[i].id === _mep.constituency) {
					_con = locals_parties[i].long;
					_conshort = locals_parties[i].short;
					break;
				}
			}
			var _group;
			if (raw_groups[_mep.group]) {
				_group = raw_groups[_mep.group];
			} else {
				_group = {short: '', long: ''};
			}
			var _vote = {};
			classified_data_msone.forEach(function (c) {
				var amend = amendments_by_ids[c.uid];
				amend.authors.forEach(function (author) {
					if (author.uid === key) {
						_vote[c.vote] = (_vote[c.vote] || 0) + 1;
					}
				})
			});
			result.push(
				cvsify(key) + ';' +
					cvsify(_mep.title) + ';' +
					cvsify(_mep.firstname) + ';' +
					cvsify(_mep.surname) + ';' +
					cvsify(_mep.salutation) + ';' +
					cvsify(_mep.email) + ';' +
					cvsify(raw_countries[_mep.country]) + ';' +
					cvsify(_mep.country) + ';' +
					cvsify(_group.long) + ';' +
					cvsify(_mep.group) + ';' +
					cvsify(_mep.constituency) + ';' +
					cvsify(_conshort) + ';' +
					cvsify(_con) + ';' +
					(_vote.stronger || 0) + ';' +
					(_vote.weaker || 0) + ';' +
					(_vote.neutral || 0) + ';' +
					((_vote.stronger || 0) - (_vote.weaker || 0))
			);
		}
		res.setHeader('Content-Type', 'text/plain');
		res.send(result.join("\n"));

	}
	else {
		return res.redirect(config.prefix);
	}
});

/* get something to classify */
app.get(config.prefix + '/amendment/:id/:user', function (req, res) {
	if (!req.user) {
		res.send(404);
		return;
	}
	var index = -1;
	if (req.params.id === 'start') {
		index = 0;
	} else if (req.params.id) {
		index = getIndexOfAmendment(req.params.id);
	}
	if (index < 0) {
		res.json([]);
		return;
	}
	sendAmendment(res, index, req.params.user);
});

app.get(config.prefix + '/amendment/nr/:nr/:user', function (req, res) {
	if (!req.user) {
		res.send(404);
		return;
	}
	var nr = req.params.nr;
	if (isNaN(nr)) {
		res.json([]);
		return;
	}
	nr = parseInt(nr);
	var index = getIndexOfAmendmentByNumber(nr);
	if (index < 0) {
		res.json([]);
		return;
	}
	sendAmendment(res, index, req.params.user);
});

/* login reciever */
app.post(config.prefix + '/login', function (req, res, next) {
	passport.authenticate('local', function (err, user, info) {
		if (err) {
			return next(err)
		}
		if (!user) {
			req.session.messages = [info.message];
			return res.redirect(config.prefix)
		}
		req.logIn(user, function (err) {
			if (err) {
				return next(err);
			}
			return res.redirect(config.prefix);
		});
	})(req, res, next);
});

/* classification reciever */
app.post(config.prefix + '/submit', function (req, res) {
	if (!req.user) {
		res.send(404);
		return;
	}
	if ((!req.body.id) || (!amendments_by_ids[req.body.id] )) {
		res.json({error: 'An transmission error occured, please reload the site'});
	} else if (!req.body.vote) {
		res.json({error: 'No classification'});
	} else if (!req.body.user) {
		res.json({error: 'Please specify a user'});
	} else {
		classified_by_users_and_ids[req.body.user] = classified_by_users_and_ids[req.body.user] || {};
		var _classified = classified_by_users_and_ids[req.body.user][req.body.id];
		if (!_classified) {
			_classified = {uid: req.body.id, user: req.body.user};
			classified_by_users_and_ids[req.body.user][req.body.id] = _classified;
			classified.push(_classified);
		}
		_classified.vote = req.body.vote;
		_classified.topic = req.body.topic;
		_classified.category = req.body.category.trim();
		_classified.comment = req.body.comment;
		_classified.conflict = (req.body.conflict == "true");
		if ((_classified.category) && (_classified.category.length > 0)) {
			if (cats.indexOf(_classified.category) < 0) {
				cats.push(_classified.category);
				cats.sort(function (a, b) {
					if (a < b)
						return -1;
					if (a > b)
						return 1;
					return 0;
				});
				save_cats();
			}
		}
		var index = getIndexOfAmendment(req.body.id);
		var navig = parcelNavig(index, req.body.user);
		if (navig.next) {
			sendAmendment(res, getIndexOfAmendment(navig.next), req.body.user);
		} else {
			res.json({error: 'No more data'});
		}
		save_classified();
	}
});

/* logout */
app.get(config.prefix + '/logout', function (req, res) {
	req.logout();
	res.redirect(config.prefix);
});

app.listen(config.port, config.hostname);
console.log('Listen ' + config.hostname + ':' + config.port);
