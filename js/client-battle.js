(function ($) {

	var BattleRoom = this.BattleRoom = ConsoleRoom.extend({
		type: 'battle',
		title: '',
		minWidth: 320,
		minMainWidth: 956,
		maxWidth: 1180,
		initialize: function (data) {
			this.me = {};

			this.$el.addClass('ps-room-opaque').html('<div class="battle">Battle is here</div><div class="foehint"></div><div class="battle-log"></div><div class="battle-log-add">Connecting...</div><div class="battle-controls"></div><button class="battle-chat-toggle button" name="showChat"><i class="fa fa-caret-left"></i> Chat</button>');

			this.$battle = this.$el.find('.battle');
			this.$controls = this.$el.find('.battle-controls');
			this.$chatFrame = this.$el.find('.battle-log');
			this.$chatAdd = this.$el.find('.battle-log-add');
			this.$join = null;
			this.$foeHint = this.$el.find('.foehint');

			BattleSound.setMute(Tools.prefs('mute'));
			this.battle = new Battle(this.$battle, this.$chatFrame);
			this.tooltips = new BattleTooltips(this.battle, this);

			this.battle.roomid = this.id;
			this.users = {};

			this.$chat = this.$chatFrame.find('.inner');

			this.$options = this.battle.optionsElem.html('<div style="padding-top: 3px; text-align: right"><label style="font-size: 8pt; padding: 3px 5px"><input type="checkbox" name="ignorespects" /> Ignore Spectators</label> <label style="font-size: 8pt; padding: 3px 5px"><input type="checkbox" name="ignoreopp" /> Ignore Players</label></div>');

			this.battle.customCallback = _.bind(this.updateControls, this);
			this.battle.endCallback = _.bind(this.updateControls, this);
			this.battle.startCallback = _.bind(this.updateControls, this);
			this.battle.stagnateCallback = _.bind(this.updateControls, this);

			this.battle.play();
		},
		events: {
			'change input[name=ignorespects]': 'toggleIgnoreSpects',
			'change input[name=ignoreopp]': 'toggleIgnoreOpponent',
			'click .replayDownloadButton': 'clickReplayDownloadButton'
		},
		battleEnded: false,
		join: function () {
			app.send('/join ' + this.id);
		},
		showChat: function () {
			this.$('.battle-chat-toggle').attr('name', 'hideChat').html('Battle <i class="fa fa-caret-right"></i>');
			this.$el.addClass('showing-chat');
		},
		hideChat: function () {
			this.$('.battle-chat-toggle').attr('name', 'showChat').html('<i class="fa fa-caret-left"></i> Chat');
			this.$el.removeClass('showing-chat');
		},
		leave: function () {
			if (!this.expired) app.send('/leave ' + this.id);
			if (this.battle) this.battle.destroy();
		},
		requestLeave: function (e) {
			if (this.side && this.battle && !this.battleEnded && !this.expired && !this.battle.forfeitPending) {
				app.addPopup(ForfeitPopup, {room: this, sourceEl: e && e.currentTarget});
				return false;
			}
			return true;
		},
		updateLayout: function () {
			var width = this.$el.width();
			if (width < 950) {
				this.battle.messageDelay = 800;
			} else {
				this.battle.messageDelay = 8;
			}
			if (width && width < 640) {
				var scale = (width / 640);
				this.$battle.css('transform', 'scale(' + scale + ')');
				this.$foeHint.css('transform', 'scale(' + scale + ')');
				this.$controls.css('top', 360 * scale + 10);
			} else {
				this.$battle.css('transform', 'none');
				this.$foeHint.css('transform', 'none');
				this.$controls.css('top', 370);
			}
			this.$el.toggleClass('small-layout', width < 830);
			this.$el.toggleClass('tiny-layout', width < 640);
			if (this.$chat) this.$chatFrame.scrollTop(this.$chat.height());
		},
		show: function () {
			Room.prototype.show.apply(this, arguments);
			this.updateLayout();
		},
		receive: function (data) {
			this.add(data);
		},
		focus: function () {
			this.tooltips.hideTooltip();
			if (this.battle.playbackState === 3) this.battle.play();
			ConsoleRoom.prototype.focus.call(this);
		},
		blur: function () {
			this.battle.pause();
		},
		init: function (data) {
			var log = data.split('\n');
			if (data.substr(0, 6) === '|init|') log.shift();
			if (log.length && log[0].substr(0, 7) === '|title|') {
				this.title = log[0].substr(7);
				log.shift();
				app.roomTitleChanged(this);
			}
			if (this.battle.activityQueue.length) return;
			this.battle.activityQueue = log;
			this.battle.fastForwardTo(-1);
			if (this.battle.ended) this.battleEnded = true;
			this.updateLayout();
			this.updateControls();
		},
		add: function (data) {
			if (!data) return;
			if (data.substr(0, 6) === '|init|') {
				return this.init(data);
			}
			if (data.substr(0, 9) === '|request|') {
				var choiceData = {offset: 0};
				var requestData = null;
				data = data.slice(9);
				if (!isNaN(data.substr(0, 1)) && data.substr(1, 1) === '|') {
					var nlIndex = data.indexOf('\n');
					if (nlIndex >= 0) {
						choiceData.offset = +data.substr(0, 1);
						try {
							$.extend(choiceData, $.parseJSON(data.slice(2, nlIndex)));
						} catch (err) {}
						data = data.slice(nlIndex + 1);
					}
				}
				try {
					requestData = $.parseJSON(data);
				} catch (err) {}
				return this.receiveRequest(requestData, choiceData);
			}

			var log = data.split('\n');
			for (var i = 0; i < log.length; i++) {
				var logLine = log[i];

				if (logLine === '|') {
					this.callbackWaiting = false;
					this.controlsShown = false;
					this.$controls.html('');
				}

				if (logLine.substr(0, 10) === '|callback|') {
					// TODO: Maybe a more sophisticated UI for this.
					// In singles, this isn't really necessary because some elements of the UI will be
					// immediately disabled. However, in doubles/triples it might not be obvious why
					// the player is being asked to make a new decision without the following messages.
					var args = logLine.substr(10).split('|');
					var pokemon = isNaN(Number(args[1])) ? this.battle.getPokemon(args[1]) : this.battle.mySide.active[args[1]];
					var requestData = this.request.active[pokemon ? pokemon.slot : 0];
					delete this.choice;
					switch (args[0]) {
					case 'trapped':
						requestData.trapped = true;
						this.battle.activityQueue.push('|message|' + pokemon.getName() + ' is trapped and cannot switch!');
						break;
					case 'cant':
						for (var i = 0; i < requestData.moves.length; i++) {
							if (requestData.moves[i].id === args[3]) {
								requestData.moves[i].disabled = true;
							}
						}
						args.splice(1, 1, pokemon.getIdent());
						this.battle.activityQueue.push('|' + args.join('|'));
						break;
					}
				} else if (logLine.substr(0, 7) === '|title|') { // eslint-disable-line no-empty
				} else if (logLine.substr(0, 5) === '|win|') {
					this.battleEnded = true;
					this.battle.activityQueue.push(logLine);
				} else if (logLine.substr(0, 6) === '|chat|' || logLine.substr(0, 3) === '|c|' || logLine.substr(0, 9) === '|chatmsg|' || logLine.substr(0, 10) === '|inactive|') {
					this.battle.instantAdd(logLine);
				} else {
					this.battle.activityQueue.push(logLine);
				}
			}
			this.battle.add('', Tools.prefs('noanim'));
			this.updateControls();
		},
		toggleMessages: function (user) {
			var $messages = $('.chatmessage-' + user + '.revealed');
			var $button = $messages.find('button');
			if (!$messages.is(':hidden')) {
				$messages.hide();
				$button.html('<small>(' + ($messages.length) + ' line' + ($messages.length > 1 ? 's' : '') + 'from ' + user + ')</small>');
				$button.parent().show();
			} else {
				$button.html('<small>(Hide ' + ($messages.length) + ' line' + ($messages.length > 1 ? 's' : '') + ' from ' + user + ')</small>');
				$button.parent().removeClass('revealed');
				$messages.show();
			}
		},

		/*********************************************************
		 * Battle stuff
		 *********************************************************/

		updateControls: function () {
			if (this.$join) {
				this.$join.remove();
				this.$join = null;
			}

			var controlsShown = this.controlsShown;
			this.controlsShown = false;

			if (this.battle.playbackState === 5) {

				// battle is seeking
				this.$controls.html('');
				return;

			} else if (this.battle.playbackState === 2 || this.battle.playbackState === 3) {

				// battle is playing or paused
				if (this.side) {
					// is a player
					this.$controls.html('<p><button name="skipTurn">Skip turn <i class="fa fa-step-forward"></i></button><button name="goToEnd">Go to last turn <i class="fa fa-fast-forward"></i></button></p>');
				} else {
					this.$controls.html('<p><button name="switchSides"><i class="fa fa-random"></i> Switch sides</button> <button name="skipTurn">Skip turn <i class="fa fa-step-forward"></i></button> <button name="goToEnd">Go to last turn <i class="fa fa-fast-forward"></i></button></p>');
				}
				return;

			}

			if (this.battle.ended) {

				var replayDownloadButton = '<span style="float:right;"><a href="//replay.pokemonshowdown.com/" class="button replayDownloadButton" style="padding:2px 6px"><i class="fa fa-download"></i> Download replay</a><br /><br /><button name="saveReplay"><i class="fa fa-upload"></i> Upload and share replay</button></span>';

				// battle has ended
				if (this.side) {
					// was a player
					this.closeNotification('choice');
					this.$controls.html('<div class="controls"><p>' + replayDownloadButton + '<em><button name="instantReplay"><i class="fa fa-undo"></i> Instant Replay</button></p><p><button name="closeAndMainMenu"><strong>Main menu</strong><br /><small>(closes this battle)</small></button> <button name="closeAndRematch"><strong>Rematch</strong><br /><small>(closes this battle)</small></button></p></div>');
				} else {
					this.$controls.html('<div class="controls"><p>' + replayDownloadButton + '<em><button name="switchSides"><i class="fa fa-random"></i> Switch sides</button> <button name="instantReplay"><i class="fa fa-undo"></i> Instant Replay</button></p></div>');
				}

			} else if (!this.battle.mySide.initialized || !this.battle.yourSide.initialized) {

				// empty battle

				if (this.side) {
					if (this.battle.kickingInactive) {
						this.$controls.html('<div class="controls"><p><button name="setTimer" value="off"><small>Stop timer</small></button> <small>&larr; Your opponent has disconnected. This will give them more time to reconnect.</small></p></div>');
					} else {
						this.$controls.html('<div class="controls"><p><button name="setTimer" value="on"><small>Claim victory</small></button> <small>&larr; Your opponent has disconnected. Click this if they don\'t reconnect.</small></p></div>');
					}
				} else {
					this.$controls.html('<p><em>Waiting for players...</em></p>');
					this.$join = $('<div class="playbutton"><button name="joinBattle">Join Battle</button></div>');
					this.$battle.append(this.$join);
				}

			} else if (this.side) {

				// player
				if (!this.request) {
					if (this.battle.kickingInactive) {
						this.$controls.html('<div class="controls"><p><button name="setTimer" value="off"><small>Stop timer</small></button> <small>&larr; Your opponent has disconnected. This will give them more time to reconnect.</small></p></div>');
					} else {
						this.$controls.html('<div class="controls"><p><button name="setTimer" value="on"><small>Claim victory</small></button> <small>&larr; Your opponent has disconnected. Click this if they don\'t reconnect.</small></p></div>');
					}
				} else {
					this.controlsShown = true;
					if (!controlsShown || typeof this.choice === 'undefined' || this.choice && this.choice.waiting) {
						// don't update controls (and, therefore, side) if `this.choice === null`: causes damage miscalculations
						this.updateControlsForPlayer();
					}
				}

			} else {

				// full battle
				this.$controls.html('<p><em><button name="switchSides"><i class="fa fa-random"></i> Switch sides</button> Waiting for players...</em></p>');

			}

			// This intentionally doesn't happen if the battle is still playing,
			// since those early-return.
			app.topbar.updateTabbar();
		},
		controlsShown: false,
		updateControlsForPlayer: function () {
			var battle = this.battle;

			this.callbackWaiting = true;
			var active = this.battle.mySide.active[0];
			if (!active) active = {};

			var act = '';
			var switchables = [];
			if (this.request) {
				// TODO: investigate when to do this
				this.updateSide(this.request.side);

				act = this.request.requestType;
				if (this.request.side) {
					switchables = this.myPokemon;
				}
				if (!this.finalDecision) this.finalDecision = !!this.request.noCancel;
			}

			var choiceOffset = this.choiceData.offset && this.choiceData.offset <= 3 ? this.choiceData.offset : 0;
			var preDecided = _.map(getString(this.choiceData.done).split(''), Number);
			var preSwitchFlags = _.map(getString(this.choiceData.enter).split(''), Number);
			var preSwitchOutFlags = _.map(getString(this.choiceData.leave).split(''), Number);
			var preTeamOrder = _.map(getString(this.choiceData.team).split(''), Number);

			if (this.choice && this.choice.waiting) {
				act = '';
			}

			var type = this.choice ? this.choice.type : '';

			// The choice object:
			// !this.choice = nothing has been chosen
			// this.choice.choices = array of choice strings
			// this.choice.switchFlags = dict of pokemon indexes that have a switch pending

			switch (act) {
			case 'move':
				if (!this.choice) {
					this.choice = {
						preDecided: preDecided,
						choices: new Array(choiceOffset),
						switchFlags: {},
						switchOutFlags: {}
					};
					for (var i = 0; i < preSwitchFlags.length; i++) this.choice.switchFlags[preSwitchFlags[i]] = 1;
					for (var i = 0; i < preSwitchOutFlags.length; i++) this.choice.switchOutFlags[preSwitchOutFlags[i]] = 1;
				}
				if (choiceOffset < this.battle.mySide.active.length) {
					this.updateMoveControls(type);
				} else {
					this.updateWaitControls();
				}
				break;

			case 'switch':
				if (!this.choice) {
					this.choice = {
						preDecided: preDecided,
						choices: new Array(choiceOffset),
						switchFlags: {},
						switchOutFlags: {},
						freedomDegrees: 0, // Fancy term for the amount of Pokémon that won't be able to switch out.
						canSwitch: 0
					};
					for (var i = 0; i < preSwitchFlags.length; i++) this.choice.switchFlags[preSwitchFlags[i]] = 1;
					for (var i = 0; i < preSwitchOutFlags.length; i++) this.choice.switchOutFlags[preSwitchOutFlags[i]] = 1;

					if (this.request.forceSwitch !== true) {
						var faintedLength = _.filter(this.request.forceSwitch.slice(choiceOffset), function (fainted) {return fainted;}).length;
						var freedomDegrees = faintedLength - _.filter(switchables.slice(this.battle.mySide.active.length), function (mon) {return !mon.zerohp;}).length;
						this.choice.freedomDegrees = Math.max(freedomDegrees, 0);
						this.choice.canSwitch = faintedLength - this.choice.freedomDegrees;
					}
				}
				if (choiceOffset < this.battle.mySide.active.length) {
					this.updateSwitchControls(type);
				} else {
					this.updateWaitControls();
				}
				break;

			case 'team':
				if (!this.choice) {
					this.choice = {
						preDecided: preDecided,
						choices: null,
						preTeamOrder: preTeamOrder,
						teamPreview: [1, 2, 3, 4, 5, 6].slice(0, switchables.length),
						done: 0,
						count: 1
					};
					if (this.battle.gameType === 'doubles') {
						this.choice.count = 2;
					}
					if (this.battle.gameType === 'triples' || this.battle.gameType === 'rotation') {
						this.choice.count = 3;
					}
					// Request full team order if one of our Pokémon has Illusion
					for (var i = 0; i < switchables.length && i < 6; i++) {
						if (toId(switchables[i].baseAbility) === 'illusion') {
							this.choice.count = 6;
						}
					}
					if (this.battle.teamPreviewCount) {
						var requestCount = parseInt(this.battle.teamPreviewCount, 10);
						if (requestCount > 0 && requestCount <= switchables.length) {
							this.choice.count = requestCount;
						}
					}
					this.choice.choices = new Array(this.choice.count);
				}
				if (choiceOffset < this.choice.count) {
					this.updateTeamControls(type);
				} else {
					this.updateWaitControls(type);
				}
				break;

			default:
				this.updateWaitControls();
				break;
			}
		},
		updateMoveControls: function (type) {
			var preDecided = this.choice.preDecided;
			var switchables = this.request && this.request.side ? this.myPokemon : [];

			if (type !== 'movetarget') {
				while (preDecided.indexOf(this.choice.choices.length) >= 0 || switchables[this.choice.choices.length] && switchables[this.choice.choices.length].fainted && this.choice.choices.length + 1 < this.battle.mySide.active.length) {
					this.choice.choices.push(preDecided.indexOf(this.choice.choices.length) >= 0 ? 'skip' : 'pass');
				}
			}

			var moveTarget = this.choice ? this.choice.moveTarget : '';
			var pos = this.choice.choices.length - (type === 'movetarget' ? 1 : 0);

			var hpRatio = switchables[pos].hp / switchables[pos].maxhp;
			var hpBar = '<small class="' + (hpRatio < 0.2 ? 'critical' : hpRatio < 0.5 ? 'weak' : 'healthy') + '">' + switchables[pos].hp + '/' + switchables[pos].maxhp + '</small>';

			var curActive = this.request && this.request.active && this.request.active[pos];
			if (!curActive) return;
			var trapped = curActive.trapped;
			var canMegaEvo = curActive.canMegaEvo || switchables[pos].canMegaEvo;

			this.finalDecisionMove = curActive.maybeDisabled || false;
			this.finalDecisionSwitch = curActive.maybeTrapped || false;
			for (var i = pos + 1; i < this.battle.mySide.active.length; ++i) {
				var p = this.battle.mySide.active[i];
				if (p && !p.fainted) {
					this.finalDecisionMove = this.finalDecisionSwitch = false;
					break;
				}
			}

			var requestTitle = '';
			if (type === 'move2' || type === 'movetarget') {
				requestTitle += '<button name="clearChoice">Back</button> ';
			}

			// Target selector
			if (type === 'movetarget') {
				requestTitle += 'At who? ' + hpBar;

				var targetMenus = ['', ''];
				var myActive = this.battle.mySide.active;
				var yourActive = this.battle.yourSide.active;
				var yourSlot = yourActive.length - 1 - pos;

				for (var i = yourActive.length - 1; i >= 0; i--) {
					var pokemon = yourActive[i];

					var disabled = false;
					if (moveTarget === 'adjacentAlly' || moveTarget === 'adjacentAllyOrSelf') {
						disabled = true;
					} else if (moveTarget === 'normal' || moveTarget === 'adjacentFoe') {
						if (Math.abs(yourSlot - i) > 1) disabled = true;
					}

					if (disabled) {
						targetMenus[0] += '<button disabled="disabled" style="visibility:hidden"></button> ';
					} else if (!pokemon || pokemon.zerohp) {
						targetMenus[0] += '<button class="disabled" name="chooseMoveTarget" value="' + (i + 1) + '"><span class="picon" style="' + Tools.getPokemonIcon('missingno') + '"></span></button> ';
					} else {
						targetMenus[0] += '<button name="chooseMoveTarget" value="' + (i + 1) + '"' + this.tooltips.tooltipAttrs("your" + i, 'pokemon', true) + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
					}
				}
				for (var i = 0; i < myActive.length; i++) {
					var pokemon = myActive[i];

					var disabled = false;
					if (moveTarget === 'adjacentFoe') {
						disabled = true;
					} else if (moveTarget === 'normal' || moveTarget === 'adjacentAlly' || moveTarget === 'adjacentAllyOrSelf') {
						if (Math.abs(pos - i) > 1) disabled = true;
					}
					if (moveTarget !== 'adjacentAllyOrSelf' && pos == i) disabled = true;

					if (disabled) {
						targetMenus[1] += '<button disabled="disabled" style="visibility:hidden"></button> ';
					} else if (!pokemon || pokemon.zerohp) {
						targetMenus[1] += '<button class="disabled" name="chooseMoveTarget" value="' + (-(i + 1)) + '"><span class="picon" style="' + Tools.getPokemonIcon('missingno') + '"></span></button> ';
					} else {
						targetMenus[1] += '<button name="chooseMoveTarget" value="' + (-(i + 1)) + '"' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
					}
				}

				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + '</div>' +
					'<div class="switchmenu" style="display:block">' + targetMenus[0] + '<div style="clear:both"></div> </div>' +
					'<div class="switchmenu" style="display:block">' + targetMenus[1] + '</div>' +
					'</div>'
				);
			} else {
				// Move chooser
				requestTitle += ' What will <strong>' + Tools.escapeHTML(switchables[pos].name) + '</strong> do? ' + hpBar + '';

				var hasMoves = false;
				var moveMenu = '';
				var movebuttons = '';
				for (var i = 0; i < curActive.moves.length; i++) {
					var moveData = curActive.moves[i];
					var move = Tools.getMove(moveData.move);
					var name = move.name;
					var pp = moveData.pp + '/' + moveData.maxpp;
					if (!moveData.maxpp) pp = '&ndash;';
					if (move.id === 'Struggle' || move.id === 'Recharge') pp = '&ndash;';
					if (move.id === 'Recharge') move.type = '&ndash;';
					if (name.substr(0, 12) === 'Hidden Power') name = 'Hidden Power';
					var moveType = this.tooltips.getMoveType(move, this.battle.mySide.active[pos] || this.myPokemon[pos]);
					if (moveData.disabled) {
						movebuttons += '<button disabled="disabled"' + this.tooltips.tooltipAttrs(moveData.move, 'move') + '>';
					} else {
						movebuttons += '<button class="type-' + moveType + '" name="chooseMove" value="' + (i + 1) + '" data-move="' + Tools.escapeHTML(moveData.move) + '" data-target="' + Tools.escapeHTML(moveData.target) + '"' + this.tooltips.tooltipAttrs(moveData.move, 'move') + '>';
						hasMoves = true;
					}
					movebuttons += name + '<br /><small class="type">' + (moveType ? Tools.getType(moveType).name : "Unknown") + '</small> <small class="pp">' + pp + '</small>&nbsp;</button> ';
				}
				if (!hasMoves) {
					moveMenu += '<button class="movebutton" name="chooseMove" value="0" data-move="Struggle" data-target="randomNormal">Struggle<br /><small class="type">Normal</small> <small class="pp">&ndash;</small>&nbsp;</button> ';
				} else {
					moveMenu += movebuttons;
				}
				if (canMegaEvo) {
					moveMenu += '<br /><label class="megaevo"><input type="checkbox" name="megaevo" />&nbsp;Mega&nbsp;Evolution</label>';
				}
				if (this.finalDecisionMove) {
					moveMenu += '<em style="display:block;clear:both">You <strong>might</strong> have some moves disabled, so you won\'t be able to cancel an attack!</em><br/>';
				}
				moveMenu += '<div style="clear:left"></div>';

				var moveControls = (
					'<div class="movecontrols">' +
					'<div class="moveselect"><button name="selectMove">Attack</button></div>' +
					'<div class="movemenu">' + moveMenu + '</div>' +
					'</div>'
				);

				var shiftControls = '';
				if (this.battle.gameType === 'triples' && pos !== 1) {
					shiftControls += '<div class="shiftselect"><button name="chooseShift">Shift</button></div>';
				}

				var switchMenu = '';
				if (trapped) {
					switchMenu += '<em>You are trapped and cannot switch!</em>';
				} else {
					for (var i = 0; i < switchables.length; i++) {
						var pokemon = switchables[i];
						pokemon.name = pokemon.ident.substr(4);
						if (pokemon.zerohp || i < this.battle.mySide.active.length || this.choice.switchFlags[i]) {
							switchMenu += '<button class="disabled" name="chooseDisabled" value="' + Tools.escapeHTML(pokemon.name) + (pokemon.zerohp ? ',fainted' : i < this.battle.mySide.active.length ? ',active' : '') + '"' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + (!pokemon.zerohp ? '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
						} else {
							switchMenu += '<button name="chooseSwitch" value="' + i + '"' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
						}
					}
					if (this.finalDecisionSwitch && this.battle.gen > 2) {
						switchMenu += '<em style="display:block;clear:both">You <strong>might</strong> be trapped, so you won\'t be able to cancel a switch!</em><br/>';
					}
				}
				var switchControls = (
					'<div class="switchcontrols">' +
					'<div class="switchselect"><button name="selectSwitch">Switch</button></div>' +
					'<div class="switchmenu">' + switchMenu + '</div>' +
					'</div>'
				);

				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + '</div>' +
					moveControls + shiftControls + switchControls +
					'</div>'
				);
			}
		},
		updateSwitchControls: function (type) {
			var preDecided = this.choice.preDecided;
			var pos = this.choice.choices.length;

			if (type !== 'switchposition' && this.request.forceSwitch !== true && !this.choice.freedomDegrees) {
				while (preDecided.indexOf(pos) >= 0 || !this.request.forceSwitch[pos] && pos < 6) {
					pos = this.choice.choices.push(preDecided.indexOf(pos) >= 0 ? 'skip' : 'pass');
				}
			}

			var switchables = this.request && this.request.side ? this.myPokemon : [];
			var myActive = this.battle.mySide.active;

			var requestTitle = '';
			if (type === 'switch2' || type === 'switchposition') {
				requestTitle += '<button name="clearChoice">Back</button> ';
			}

			// Place selector
			if (type === 'switchposition') {
				// TODO? hpbar
				requestTitle += "Which Pokémon will it switch in for?";
				var controls = '<div class="switchmenu" style="display:block">';
				for (var i = 0; i < myActive.length; i++) {
					var pokemon = this.myPokemon[i];
					if (pokemon && !pokemon.zerohp || this.choice.switchOutFlags[i]) {
						controls += '<button disabled' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + (!pokemon.zerohp ? '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
					} else if (!pokemon) {
						controls += '<button disabled></button> ';
					} else {
						controls += '<button name="chooseSwitchTarget" value="' + i + '"' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') + '</button> ';
					}
				}
				controls += '</div>';
				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + '</div>' +
					controls +
					'</div>'
				);
			} else {
				if (this.choice.freedomDegrees >= 1) {
					requestTitle += "Choose a Pokémon to send to battle!";
				} else {
					requestTitle += "Switch <strong>" + Tools.escapeHTML(switchables[pos].name) + "</strong> to:";
				}

				var switchMenu = '';
				for (var i = 0; i < switchables.length; i++) {
					var pokemon = switchables[i];
					if (pokemon.zerohp || i < this.battle.mySide.active.length || this.choice.switchFlags[i]) {
						switchMenu += '<button class="disabled" name="chooseDisabled" value="' + Tools.escapeHTML(pokemon.name) + (pokemon.zerohp ? ',fainted' : i < this.battle.mySide.active.length ? ',active' : '') + '"' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '>';
					} else {
						switchMenu += '<button name="chooseSwitch" value="' + i + '"' + this.tooltips.tooltipAttrs(i, 'sidepokemon') + '>';
					}
					switchMenu += '<span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + (!pokemon.zerohp ? '<span class="hpbar' + pokemon.getHPColorClass() + '"><span style="width:' + (Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1) + 'px"></span></span>' + (pokemon.status ? '<span class="status ' + pokemon.status + '"></span>' : '') : '') + '</button> ';
				}

				var controls = (
					'<div class="switchcontrols">' +
					'<div class="switchselect"><button name="selectSwitch">Switch</button></div>' +
					'<div class="switchmenu">' + switchMenu + '</div>' +
					'</div>'
				);
				this.$controls.html(
					'<div class="controls">' +
					'<div class="whatdo">' + requestTitle + '</div>' +
					controls +
					'</div>'
				);
				this.selectSwitch();
			}
		},
		updateTeamControls: function (type) {
			var switchables = this.request && this.request.side ? this.myPokemon : [];
			var maxIndex = Math.min(switchables.length, 6);

			var requestTitle = "";
			if (this.choice.done) {
				requestTitle = '<button name="clearChoice">Back</button> ' + "What about the rest of your team?";
			} else {
				requestTitle = "How will you start the battle?";
			}

			var switchMenu = '';
			for (var i = 0; i < maxIndex; i++) {
				var oIndex = this.choice.teamPreview[i] - 1;
				var pokemon = switchables[oIndex];
				if (i < this.choice.done) {
					switchMenu += '<button disabled="disabled"' + this.tooltips.tooltipAttrs(oIndex, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + '</button> ';
				} else {
					switchMenu += '<button name="chooseTeamPreview" value="' + i + '"' + this.tooltips.tooltipAttrs(oIndex, 'sidepokemon') + '><span class="picon" style="' + Tools.getPokemonIcon(pokemon) + '"></span>' + Tools.escapeHTML(pokemon.name) + '</button> ';
				}
			}

			var controls = (
				'<div class="switchcontrols">' +
				'<div class="switchselect"><button name="selectSwitch">' + (this.choice.done ? '' + "Choose a Pokémon for slot " + (this.choice.done + 1) : "Choose Lead") + '</button></div>' +
				'<div class="switchmenu">' + switchMenu + '</div>' +
				'</div>'
			);
			this.$controls.html(
				'<div class="controls">' +
				'<div class="whatdo">' + requestTitle + '</div>' +
				controls +
				'</div>'
			);
			this.selectSwitch();
		},
		updateWaitControls: function () {
			var buf = '<p><em>' + "Waiting for opponent..." + '</em> ';
			if (this.choice && this.choice.waiting && !this.finalDecision) {
				buf += '<button name="undoChoice">' + "Cancel" + '</button>';
			}
			buf += '</p>';
			if (this.battle.kickingInactive) {
				buf += '<p class="timer"><button name="setTimer" value="off"><small>' + "Stop timer" + '</small></button></p>';
			} else {
				buf += '<p class="timer"><button name="setTimer" value="on"><small>' + "Start timer" + '</small></button></p>';
			}
			this.$controls.html(
				'<div class="controls" style="height:130px">' +
				buf +
				'</div>'
			);
		},

		decide: function (message) {
			if (this.partialDecisions) return this.sendDecision(message);
			if (this.choice.choices.length >= (this.choice.count || this.battle.mySide.active.length)) {
				return this.sendDecision(this.choice.choices);
			}
		},

		// Appends the rqid to the message so that the server can
		// verify that the decision is sent in response to the correct request.
		sendDecision: function (message) {
			if (!$.isArray(message)) return this.send('/' + message + '|' + this.request.rqid);
			var buf = '/choose ';
			for (var i = 0; i < message.length; i++) {
				if (message[i]) buf += message[i] + ',';
			}
			this.send(buf.substr(0, buf.length - 1) + '|' + this.request.rqid);
		},
		request: null,
		receiveRequest: function (request, choiceData) {
			if (!request) {
				this.side = '';
				return;
			}
			request.requestType = 'move';
			var notifyObject = null;
			if (request.forceSwitch) {
				request.requestType = 'switch';
			} else if (request.teamPreview) {
				request.requestType = 'team';
			} else if (request.wait) {
				request.requestType = 'wait';
			}

			this.choice = null;
			this.choiceData = choiceData;
			this.finalDecision = this.finalDecisionMove = this.finalDecisionSwitch = false;
			this.request = request;
			if (request.side) {
				this.updateSideLocation(request.side, true);
			}
			this.notifyRequest();
			this.updateControls();
		},
		notifyRequest: function () {
			var oName = this.battle.yourSide.name;
			if (oName) oName = " against " + oName;
			switch (this.request.requestType) {
			case 'move':
				this.notify("Your move!", "Move in your battle" + oName, 'choice');
				break;
			case 'switch':
				this.notify("Your switch!", "Switch in your battle" + oName, 'choice');
				break;
			case 'team':
				this.notify("Team preview!", "Choose your team order in your battle" + oName, 'choice');
				break;
			}
		},
		updateSideLocation: function (sideData, midBattle) {
			if (!sideData.id) return;
			this.side = sideData.id;
			if (this.battle.sidesSwitched !== !!(this.side === 'p2')) {
				this.battle.switchSides(!midBattle);
				this.$chat = this.$chatFrame.find('.inner');
			}
		},
		updateSide: function (sideData) {
			this.myPokemon = sideData.pokemon;
			for (var i = 0; i < sideData.pokemon.length; i++) {
				var pokemonData = sideData.pokemon[i];
				this.battle.parseDetails(pokemonData.ident.substr(4), pokemonData.ident, pokemonData.details, pokemonData);
				this.battle.parseHealth(pokemonData.condition, pokemonData);
				pokemonData.hpDisplay = Pokemon.prototype.hpDisplay;
				pokemonData.getPixelRange = Pokemon.prototype.getPixelRange;
				pokemonData.getFormattedRange = Pokemon.prototype.getFormattedRange;
				pokemonData.getHPColorClass = Pokemon.prototype.getHPColorClass;
				pokemonData.getHPColor = Pokemon.prototype.getHPColor;
				pokemonData.getFullName = Pokemon.prototype.getFullName;
			}
		},

		// buttons
		joinBattle: function () {
			this.send('/joinbattle');
		},
		setTimer: function (setting) {
			this.send('/timer ' + setting);
		},
		toggleIgnoreSpects: function (e) {
			this.battle.ignoreSpects = !!e.currentTarget.checked;
			this.battle.add('Spectators ' + (this.battle.ignoreSpects ? '' : 'no longer ') + 'ignored.');
		},
		toggleIgnoreOpponent: function (e) {
			this.battle.ignoreOpponent = !!e.currentTarget.checked;
			this.battle.add('Opponent ' + (this.battle.ignoreOpponent ? '' : 'no longer ') + 'ignored.');
		},
		forfeit: function () {
			this.send('/forfeit');
		},
		saveReplay: function () {
			this.send('/savereplay');
		},
		clickReplayDownloadButton: function (e) {
			var filename = (this.battle.tier || 'Battle').replace(/[^A-Za-z0-9]/g, '');

			// ladies and gentlemen, JavaScript dates
			var date = new Date();
			filename += '-' + date.getFullYear();
			filename += (date.getMonth() >= 9 ? '-' : '-0') + (date.getMonth() + 1);
			filename += (date.getDate() >= 10 ? '-' : '-0') + date.getDate();

			filename += '-' + toId(this.battle.p1.name);
			filename += '-' + toId(this.battle.p2.name);

			e.currentTarget.href = Tools.createReplayFileHref(this);
			e.currentTarget.download = filename + '.html';

			e.stopPropagation();
		},
		switchSides: function () {
			this.battle.switchSides();
		},
		instantReplay: function () {
			this.tooltips.hideTooltip();
			this.request = null;
			this.battle.reset();
			this.battle.play();
		},
		skipTurn: function () {
			this.battle.skipTurn();
		},
		goToEnd: function () {
			this.battle.fastForwardTo(-1);
		},
		register: function (userid) {
			var registered = app.user.get('registered');
			if (registered && registered.userid !== userid) registered = false;
			if (!registered && userid === app.user.get('userid')) {
				app.addPopup(RegisterPopup);
			}
		},
		closeAndMainMenu: function () {
			this.close();
			app.focusRoom('');
		},
		closeAndRematch: function () {
			app.rooms[''].requestNotifications();
			app.rooms[''].challenge(this.battle.yourSide.name, this.battle.tier);
			this.close();
			app.focusRoom('');
		},

		// choice buttons
		chooseMove: function (pos, e) {
			if (!this.choice) return;
			this.tooltips.hideTooltip();

			if (pos !== undefined) { // pos === undefined if called by chooseMoveTarget()
				var myActive = this.battle.mySide.active;
				var isMega = !!(this.$('input[name=megaevo]')[0] || '').checked;

				var move = e.getAttribute('data-move');
				var target = e.getAttribute('data-target');
				var choosableTargets = {normal: 1, any: 1, adjacentAlly: 1, adjacentAllyOrSelf: 1, adjacentFoe: 1};

				this.choice.choices.push('move ' + pos + (isMega ? ' mega' : ''));
				if (myActive.length > 1 && target in choosableTargets) {
					this.choice.type = 'movetarget';
					this.choice.moveTarget = target;
					this.updateControlsForPlayer();
					return false;
				}
			}

			this.endChoice();
		},
		chooseMoveTarget: function (posString) {
			this.choice.choices[this.choice.choices.length - 1] += ' ' + posString;
			this.chooseMove();
		},
		chooseShift: function () {
			if (!this.choice) return;
			this.tooltips.hideTooltip();

			this.choice.choices.push('shift');
			this.endChoice();
		},
		chooseSwitch: function (pos) {
			if (!this.choice) return;
			this.tooltips.hideTooltip();

			if (pos !== undefined) { // pos === undefined if called by chooseSwitchTarget()
				this.choice.switchFlags[pos] = true;
				if (this.choice.freedomDegrees >= 1) {
					// Request selection of a Pokémon that will be switched out.
					this.choice.type = 'switchposition';
					this.updateControlsForPlayer();
					return false;
				}
				// Default: left to right.
				this.choice.switchOutFlags[this.choice.choices.length] = true;
				this.choice.choices.push('switch ' + (parseInt(pos, 10) + 1));
				this.endChoice();
				return;
			}

			// After choosing the position to which a pokemon will switch in (Doubles/Triples end-game).
			if (!this.request || this.request.requestType !== 'switch') return false; //??
			if (this.choice.canSwitch > _.filter(this.choice.choices, function (choice) {return choice;}).length) {
				// More switches are pending.
				this.choice.type = 'switch2';
				this.updateControlsForPlayer();
				return false;
			}

			this.endTurn();
		},
		chooseSwitchTarget: function (posString) {
			var slotSwitchIn = 0; // one-based
			for (var i in this.choice.switchFlags) {
				if (this.choice.choices.indexOf('switch ' + (+i + 1)) === -1) {
					slotSwitchIn = +i + 1;
					break;
				}
			}
			this.choice.choices[posString] = 'switch ' + slotSwitchIn;
			this.choice.switchOutFlags[posString] = true;
			this.chooseSwitch();
		},
		chooseTeamPreview: function (pos) {
			if (!this.choice) return;
			pos = parseInt(pos, 10);
			this.tooltips.hideTooltip();
			if (this.choice.count) {
				var temp = this.choice.teamPreview[pos];
				this.choice.teamPreview[pos] = this.choice.teamPreview[this.choice.done];
				this.choice.teamPreview[this.choice.done] = temp;

				this.choice.done++;

				if (this.choice.done < Math.min(this.choice.teamPreview.length, this.choice.count)) {
					this.choice.type = 'team2';
					this.updateControlsForPlayer();
					return false;
				}
			} else {
				this.choice.teamPreview = [pos + 1];
			}

			this.endTurn();
		},
		chooseDisabled: function (data) {
			this.tooltips.hideTooltip();
			data = data.split(',');
			if (data[1] === 'fainted') {
				app.addPopupMessage("" + data[0] + " has no energy left to battle!");
			} else if (data[1] === 'active') {
				app.addPopupMessage("" + data[0] + " is already in battle!");
			} else {
				app.addPopupMessage("" + data[0] + " is already selected!");
			}
		},
		endChoice: function () {
			var choiceIndex = this.choice.choices.length - 1;
			if (!this.nextChoice()) {
				this.endTurn();
			} else if (this.request.partial) {
				for (var i = choiceIndex; i < this.choice.choices.length; i++) {
					this.sendDecision(this.choice.choices[i]);
				}
			}
		},
		nextChoice: function () {
			var preDecided = this.choice.preDecided;
			var choices = this.choice.choices;
			var preDecided = this.choice.preDecided;
			var myActive = this.battle.mySide.active;

			if (this.request.requestType === 'switch' && this.request.forceSwitch !== true) {
				while (preDecided.indexOf(choices.length) >= 0 || choices.length < myActive.length && !this.request.forceSwitch[choices.length]) {
					choices.push(preDecided.indexOf(choices.length) >= 0 ? 'skip' : 'pass');
				}
				if (choices.length < myActive.length) {
					this.choice.type = 'switch2';
					this.updateControlsForPlayer();
					return true;
				}
			} else if (this.request.requestType === 'move') {
				while (preDecided.indexOf(choices.length) >= 0 || choices.length < myActive.length && !myActive[choices.length]) {
					choices.push(preDecided.indexOf(choices.length) >= 0 ? 'skip' : 'pass');
				}

				if (choices.length < myActive.length) {
					this.choice.type = 'move2';
					this.updateControlsForPlayer();
					return true;
				}
			}

			return false;
		},
		endTurn: function () {
			var act = this.request && this.request.requestType;
			if (act === 'team') {
				this.sendDecision('team ' + this.choice.teamPreview.join(''));
			} else {
				if (act === 'switch') {
					// Assert that the remaining Pokémon won't switch, even though
					// the player could have decided otherwise.
					for (var i = 0; i < this.battle.mySide.active.length; i++) {
						if (!this.choice.choices[i]) this.choice.choices[i] = 'pass';
					}
				}

				for (var i = 0; i < this.choice.choices.length; i++) {
					this.decide(this.choice.choices[i]);
				}
				if (!this.finalDecision) {
					var lastChoice = this.choice.choices[this.choice.choices.length - 1];
					if (lastChoice.substr(0, 5) === 'move ' && this.finalDecisionMove) {
						this.finalDecisionMove = true;
					} else if (lastChoice.substr(0, 7) === 'switch' && this.finalDecisionSwitch) {
						this.finalDecisionSwitch = true;
					}
				}
			}
			this.closeNotification('choice');

			this.choice = {waiting: true};
			this.updateControlsForPlayer();
		},
		undoChoice: function (pos) {
			this.send('/undo');
			this.notifyRequest();

			this.choice = null;
			this.updateControlsForPlayer();
		},
		clearChoice: function () {
			this.choice = null;
			this.updateControlsForPlayer();
		},
		leaveBattle: function () {
			this.tooltips.hideTooltip();
			this.send('/leavebattle');
			this.side = '';
			this.closeNotification('choice');
		},
		selectSwitch: function () {
			this.tooltips.hideTooltip();
			this.$controls.find('.controls').attr('class', 'controls switch-controls');
		},
		selectMove: function () {
			this.tooltips.hideTooltip();
			this.$controls.find('.controls').attr('class', 'controls move-controls');
		}
	});

	var ForfeitPopup = this.ForfeitPopup = Popup.extend({
		type: 'semimodal',
		initialize: function (data) {
			this.room = data.room;
			var buf = '<form><p>Forfeiting makes you lose the battle. Are you sure?</p><p><label><input type="checkbox" name="closeroom" checked /> Close after forfeiting</label></p>';
			if (this.room.battle && this.room.battle.rated) {
				buf += '<p><button type="submit"><strong>Forfeit</strong></button> <button name="close" class="autofocus">Cancel</button></p></form>';
			} else {
				buf += '<p><button type="submit"><strong>Forfeit</strong></button> <button name="replacePlayer">Replace player</button> <button name="close" class="autofocus">Cancel</button></p></form>';
			}
			this.$el.html(buf);
		},
		replacePlayer: function (data) {
			var room = this.room;
			var self = this;
			app.addPopupPrompt("Replacement player's username", "Replace player", function (target) {
				if (!target) return;
				room.send('/addplayer ' + target);
				room.leaveBattle();
				self.close();
			});
		},
		submit: function (data) {
			this.room.send('/forfeit');
			this.room.battle.forfeitPending = true;
			if (this.$('input[name=closeroom]')[0].checked) {
				app.removeRoom(this.room.id);
			}
			this.close();
		}
	});

}).call(this, jQuery);
