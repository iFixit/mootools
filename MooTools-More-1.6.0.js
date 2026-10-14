/* MooTools: the javascript framework. license: MIT-style license. copyright: Copyright (c) 2006-2023 [Valerio Proietti](https://mootools.net/).*/
/*!
Web Build: https://mootools.net/more/builder/93a8f3a39af81415fbeb4827e5795266
*/
/*
---

script: More.js

name: More

description: MooTools More

license: MIT-style license

authors:
  - Guillermo Rauch
  - Thomas Aylott
  - Scott Kyle
  - Arian Stolwijk
  - Tim Wienk
  - Christoph Pojer
  - Aaron Newton
  - Jacob Thornton

requires:
  - Core/MooTools

provides: [MooTools.More]

...
*/

MooTools.More = {
   version: '1.6.0',
   build: '45b71db70f879781a7e0b0d3fb3bb1307c2521eb',
};

/*
---

script: Class.Binds.js

name: Class.Binds

description: Automagically binds specified methods in a class to the instance of the class.

license: MIT-style license

authors:
  - Aaron Newton

requires:
  - Core/Class
  - MooTools.More

provides: [Class.Binds]

...
*/

Class.Mutators.Binds = function (binds) {
   if (!this.prototype.initialize) this.implement('initialize', function () {});
   return Array.convert(binds).concat(this.prototype.Binds || []);
};

Class.Mutators.initialize = function (initialize) {
   return function () {
      Array.convert(this.Binds).each(function (name) {
         var original = this[name];
         if (original) this[name] = original.bind(this);
      }, this);
      return initialize.apply(this, arguments);
   };
};

/*
---

script: Class.Refactor.js

name: Class.Refactor

description: Extends a class onto itself with new property, preserving any items attached to the class's namespace.

license: MIT-style license

authors:
  - Aaron Newton

requires:
  - Core/Class
  - MooTools.More

# Some modules declare themselves dependent on Class.Refactor
provides: [Class.refactor, Class.Refactor]

...
*/

Class.refactor = function (original, refactors) {
   Object.each(refactors, function (item, name) {
      var origin = original.prototype[name];
      origin = (origin && origin.$origin) || origin || function () {};
      original.implement(
         name,
         typeof item == 'function'
            ? function () {
                 var old = this.previous;
                 this.previous = origin;
                 var value = item.apply(this, arguments);
                 this.previous = old;
                 return value;
              }
            : item
      );
   });

   return original;
};

/*
---

script: Drag.js

name: Drag

description: The base Drag Class. Can be used to drag and resize Elements using mouse events.

license: MIT-style license

authors:
  - Valerio Proietti
  - Tom Occhinno
  - Jan Kassens

requires:
  - Core/Events
  - Core/Options
  - Core/Element.Event
  - Core/Element.Style
  - Core/Element.Dimensions
  - MooTools.More

provides: [Drag]
...

*/
(function () {
   var Drag = (this.Drag = new Class({
      Implements: [Events, Options],

      options: {
         /*
		onBeforeStart: function(thisElement){},
		onStart: function(thisElement, event){},
		onSnap: function(thisElement){},
		onDrag: function(thisElement, event){},
		onCancel: function(thisElement){},
		onComplete: function(thisElement, event){},*/
         snap: 6,
         unit: 'px',
         grid: false,
         style: true,
         limit: false,
         handle: false,
         invert: false,
         unDraggableTags: ['button', 'input', 'a', 'textarea', 'select', 'option'],
         preventDefault: false,
         stopPropagation: false,
         compensateScroll: false,
         modifiers: { x: 'left', y: 'top' },
      },

      initialize: function () {
         var params = Array.link(arguments, {
            options: Type.isObject,
            element: function (obj) {
               return obj != null;
            },
         });

         this.element = document.id(params.element);
         this.document = this.element.getDocument();
         this.setOptions(params.options || {});
         var htype = typeOf(this.options.handle);
         this.handles =
            (htype == 'array' || htype == 'collection'
               ? $$(this.options.handle)
               : document.id(this.options.handle)) || this.element;
         this.mouse = { now: {}, pos: {} };
         this.value = { start: {}, now: {} };
         this.offsetParent = (function (el) {
            var offsetParent = el.getOffsetParent();
            var isBody = !offsetParent || /^(?:body|html)$/i.test(offsetParent.tagName);
            return isBody ? window : document.id(offsetParent);
         })(this.element);
         this.selection = 'selectstart' in document ? 'selectstart' : 'mousedown';

         this.compensateScroll = { start: {}, diff: {}, last: {} };

         if ('ondragstart' in document && !('FileReader' in window) && !Drag.ondragstartFixed) {
            document.ondragstart = Function.convert(false);
            Drag.ondragstartFixed = true;
         }

         this.bound = {
            start: this.start.bind(this),
            check: this.check.bind(this),
            drag: this.drag.bind(this),
            stop: this.stop.bind(this),
            cancel: this.cancel.bind(this),
            eventStop: Function.convert(false),
            scrollListener: this.scrollListener.bind(this),
         };
         this.attach();
      },

      attach: function () {
         this.handles.addEvent('mousedown', this.bound.start);
         this.handles.addEvent('touchstart', this.bound.start);
         if (this.options.compensateScroll)
            this.offsetParent.addEvent('scroll', this.bound.scrollListener);
         return this;
      },

      detach: function () {
         this.handles.removeEvent('mousedown', this.bound.start);
         this.handles.removeEvent('touchstart', this.bound.start);
         if (this.options.compensateScroll)
            this.offsetParent.removeEvent('scroll', this.bound.scrollListener);
         return this;
      },

      scrollListener: function () {
         if (!this.mouse.start) return;
         var newScrollValue = this.offsetParent.getScroll();

         if (this.element.getStyle('position') == 'absolute') {
            var scrollDiff = this.sumValues(newScrollValue, this.compensateScroll.last, -1);
            this.mouse.now = this.sumValues(this.mouse.now, scrollDiff, 1);
         } else {
            this.compensateScroll.diff = this.sumValues(
               newScrollValue,
               this.compensateScroll.start,
               -1
            );
         }
         if (this.offsetParent != window)
            this.compensateScroll.diff = this.sumValues(
               this.compensateScroll.start,
               newScrollValue,
               -1
            );
         this.compensateScroll.last = newScrollValue;
         this.render(this.options);
      },

      sumValues: function (alpha, beta, op) {
         var sum = {},
            options = this.options;
         for (var z in options.modifiers) {
            if (!options.modifiers[z]) continue;
            sum[z] = alpha[z] + beta[z] * op;
         }
         return sum;
      },

      start: function (event) {
         if (this.options.unDraggableTags.contains(event.target.get('tag'))) return;

         var options = this.options;

         if (event.rightClick) return;

         if (options.preventDefault) event.preventDefault();
         if (options.stopPropagation) event.stopPropagation();
         this.compensateScroll.start = this.compensateScroll.last = this.offsetParent.getScroll();
         this.compensateScroll.diff = { x: 0, y: 0 };
         this.mouse.start = event.page;
         this.fireEvent('beforeStart', this.element);

         var limit = options.limit;
         this.limit = { x: [], y: [] };

         var z,
            coordinates,
            offsetParent = this.offsetParent == window ? null : this.offsetParent;
         for (z in options.modifiers) {
            if (!options.modifiers[z]) continue;

            var style = this.element.getStyle(options.modifiers[z]);

            // Some browsers (IE and Opera) don't always return pixels.
            if (style && !style.match(/px$/)) {
               if (!coordinates) coordinates = this.element.getCoordinates(offsetParent);
               style = coordinates[options.modifiers[z]];
            }

            if (options.style) this.value.now[z] = (style || 0).toInt();
            else this.value.now[z] = this.element[options.modifiers[z]];

            if (options.invert) this.value.now[z] *= -1;

            this.mouse.pos[z] = event.page[z] - this.value.now[z];

            if (limit && limit[z]) {
               var i = 2;
               while (i--) {
                  var limitZI = limit[z][i];
                  if (limitZI || limitZI === 0)
                     this.limit[z][i] = typeof limitZI == 'function' ? limitZI() : limitZI;
               }
            }
         }

         if (typeOf(this.options.grid) == 'number')
            this.options.grid = {
               x: this.options.grid,
               y: this.options.grid,
            };

         var events = {
            mousemove: this.bound.check,
            mouseup: this.bound.cancel,
            touchmove: this.bound.check,
            touchend: this.bound.cancel,
         };
         events[this.selection] = this.bound.eventStop;
         this.document.addEvents(events);
      },

      check: function (event) {
         if (this.options.preventDefault) event.preventDefault();
         var distance = Math.round(
            Math.sqrt(
               Math.pow(event.page.x - this.mouse.start.x, 2) +
                  Math.pow(event.page.y - this.mouse.start.y, 2)
            )
         );
         if (distance > this.options.snap) {
            this.cancel();
            this.document.addEvents({
               mousemove: this.bound.drag,
               mouseup: this.bound.stop,
               touchmove: this.bound.drag,
               touchend: this.bound.stop,
            });
            this.fireEvent('start', [this.element, event]).fireEvent('snap', this.element);
         }
      },

      drag: function (event) {
         var options = this.options;
         if (options.preventDefault) event.preventDefault();
         this.mouse.now = this.sumValues(event.page, this.compensateScroll.diff, -1);

         this.render(options);
         this.fireEvent('drag', [this.element, event]);
      },

      render: function (options) {
         for (var z in options.modifiers) {
            if (!options.modifiers[z]) continue;
            this.value.now[z] = this.mouse.now[z] - this.mouse.pos[z];

            if (options.invert) this.value.now[z] *= -1;
            if (options.limit && this.limit[z]) {
               if (
                  (this.limit[z][1] || this.limit[z][1] === 0) &&
                  this.value.now[z] > this.limit[z][1]
               ) {
                  this.value.now[z] = this.limit[z][1];
               } else if (
                  (this.limit[z][0] || this.limit[z][0] === 0) &&
                  this.value.now[z] < this.limit[z][0]
               ) {
                  this.value.now[z] = this.limit[z][0];
               }
            }
            if (options.grid[z])
               this.value.now[z] -= (this.value.now[z] - (this.limit[z][0] || 0)) % options.grid[z];
            if (options.style)
               this.element.setStyle(options.modifiers[z], this.value.now[z] + options.unit);
            else this.element[options.modifiers[z]] = this.value.now[z];
         }
      },

      cancel: function (event) {
         this.document.removeEvents({
            mousemove: this.bound.check,
            mouseup: this.bound.cancel,
            touchmove: this.bound.check,
            touchend: this.bound.cancel,
         });
         if (event) {
            this.document.removeEvent(this.selection, this.bound.eventStop);
            this.fireEvent('cancel', this.element);
         }
      },

      stop: function (event) {
         var events = {
            mousemove: this.bound.drag,
            mouseup: this.bound.stop,
            touchmove: this.bound.drag,
            touchend: this.bound.stop,
         };
         events[this.selection] = this.bound.eventStop;
         this.document.removeEvents(events);
         this.mouse.start = null;
         if (event) this.fireEvent('complete', [this.element, event]);
      },
   }));
})();

Element.implement({
   makeResizable: function (options) {
      var drag = new Drag(
         this,
         Object.merge(
            {
               modifiers: {
                  x: 'width',
                  y: 'height',
               },
            },
            options
         )
      );

      this.store('resizer', drag);
      return drag.addEvent(
         'drag',
         function () {
            this.fireEvent('resize', drag);
         }.bind(this)
      );
   },
});

/*
---

script: Element.Measure.js

name: Element.Measure

description: Extends the Element native object to include methods useful in measuring dimensions.

credits: "Element.measure / .expose methods by Daniel Steigerwald License: MIT-style license. Copyright: Copyright (c) 2008 Daniel Steigerwald, daniel.steigerwald.cz"

license: MIT-style license

authors:
  - Aaron Newton

requires:
  - Core/Element.Style
  - Core/Element.Dimensions
  - MooTools.More

provides: [Element.Measure]

...
*/

(function () {
   var getStylesList = function (styles, planes) {
      var list = [];
      Object.each(planes, function (directions) {
         Object.each(directions, function (edge) {
            styles.each(function (style) {
               list.push(style + '-' + edge + (style == 'border' ? '-width' : ''));
            });
         });
      });
      return list;
   };

   var calculateEdgeSize = function (edge, styles) {
      var total = 0;
      Object.each(styles, function (value, style) {
         if (style.test(edge)) total = total + value.toInt();
      });
      return total;
   };

   var isVisible = function (el) {
      return !!(!el || el.offsetHeight || el.offsetWidth);
   };

   Element.implement({
      measure: function (fn) {
         if (isVisible(this)) return fn.call(this);
         var parent = this.getParent(),
            toMeasure = [];
         while (!isVisible(parent) && parent != document.body) {
            toMeasure.push(parent.expose());
            parent = parent.getParent();
         }
         var restore = this.expose(),
            result = fn.call(this);
         restore();
         toMeasure.each(function (restore) {
            restore();
         });
         return result;
      },

      expose: function () {
         if (this.getStyle('display') != 'none') return function () {};
         var before = this.style.cssText;
         this.setStyles({
            display: 'block',
            position: 'absolute',
            visibility: 'hidden',
         });
         return function () {
            this.style.cssText = before;
         }.bind(this);
      },

      getDimensions: function (options) {
         options = Object.merge({ computeSize: false }, options);
         var dim = { x: 0, y: 0 };

         var getSize = function (el, options) {
            return options.computeSize ? el.getComputedSize(options) : el.getSize();
         };

         var parent = this.getParent('body');

         if (parent && this.getStyle('display') == 'none') {
            dim = this.measure(function () {
               return getSize(this, options);
            });
         } else if (parent) {
            try {
               //safari sometimes crashes here, so catch it
               dim = getSize(this, options);
            } catch (e) {}
         }

         return Object.append(
            dim,
            dim.x || dim.x === 0
               ? {
                    width: dim.x,
                    height: dim.y,
                 }
               : {
                    x: dim.width,
                    y: dim.height,
                 }
         );
      },

      getComputedSize: function (options) {
         options = Object.merge(
            {
               styles: ['padding', 'border'],
               planes: {
                  height: ['top', 'bottom'],
                  width: ['left', 'right'],
               },
               mode: 'both',
            },
            options
         );

         var styles = {},
            size = { width: 0, height: 0 },
            dimensions;

         if (options.mode == 'vertical') {
            delete size.width;
            delete options.planes.width;
         } else if (options.mode == 'horizontal') {
            delete size.height;
            delete options.planes.height;
         }

         getStylesList(options.styles, options.planes).each(function (style) {
            styles[style] = this.getStyle(style).toInt();
         }, this);

         Object.each(
            options.planes,
            function (edges, plane) {
               var capitalized = plane.capitalize(),
                  style = this.getStyle(plane);

               if (style == 'auto' && !dimensions) dimensions = this.getDimensions();

               style = styles[plane] = style == 'auto' ? dimensions[plane] : style.toInt();
               size['total' + capitalized] = style;

               edges.each(function (edge) {
                  var edgesize = calculateEdgeSize(edge, styles);
                  size['computed' + edge.capitalize()] = edgesize;
                  size['total' + capitalized] += edgesize;
               });
            },
            this
         );

         return Object.append(size, styles);
      },
   });
})();

/*
---

script: Drag.Move.js

name: Drag.Move

description: A Drag extension that provides support for the constraining of draggables to containers and droppables.

license: MIT-style license

authors:
  - Valerio Proietti
  - Tom Occhinno
  - Jan Kassens
  - Aaron Newton
  - Scott Kyle

requires:
  - Core/Element.Dimensions
  - Drag

provides: [Drag.Move]

...
*/

Drag.Move = new Class({
   Extends: Drag,

   options: {
      /*
		onEnter: function(thisElement, overed){},
		onLeave: function(thisElement, overed){},
		onDrop: function(thisElement, overed, event){},*/
      droppables: [],
      container: false,
      precalculate: false,
      includeMargins: true,
      checkDroppables: true,
   },

   initialize: function (element, options) {
      this.parent(element, options);
      element = this.element;

      this.droppables = $$(this.options.droppables);
      this.setContainer(this.options.container);

      if (this.options.style) {
         if (this.options.modifiers.x == 'left' && this.options.modifiers.y == 'top') {
            var parent = element.getOffsetParent(),
               styles = element.getStyles('left', 'top');
            if (parent && (styles.left == 'auto' || styles.top == 'auto')) {
               element.setPosition(element.getPosition(parent));
            }
         }

         if (element.getStyle('position') == 'static') element.setStyle('position', 'absolute');
      }

      this.addEvent('start', this.checkDroppables, true);
      this.overed = null;
   },

   setContainer: function (container) {
      this.container = document.id(container);
      if (this.container && typeOf(this.container) != 'element') {
         this.container = document.id(this.container.getDocument().body);
      }
   },

   start: function (event) {
      if (this.container) this.options.limit = this.calculateLimit();

      if (this.options.precalculate) {
         this.positions = this.droppables.map(function (el) {
            return el.getCoordinates();
         });
      }

      this.parent(event);
   },

   calculateLimit: function () {
      var element = this.element,
         container = this.container,
         offsetParent = document.id(element.getOffsetParent()) || document.body,
         containerCoordinates = container.getCoordinates(offsetParent),
         elementMargin = {},
         elementBorder = {},
         containerMargin = {},
         containerBorder = {},
         offsetParentPadding = {},
         offsetScroll = offsetParent.getScroll();

      ['top', 'right', 'bottom', 'left'].each(function (pad) {
         elementMargin[pad] = element.getStyle('margin-' + pad).toInt();
         elementBorder[pad] = element.getStyle('border-' + pad).toInt();
         containerMargin[pad] = container.getStyle('margin-' + pad).toInt();
         containerBorder[pad] = container.getStyle('border-' + pad).toInt();
         offsetParentPadding[pad] = offsetParent.getStyle('padding-' + pad).toInt();
      }, this);

      var width = element.offsetWidth + elementMargin.left + elementMargin.right,
         height = element.offsetHeight + elementMargin.top + elementMargin.bottom,
         left = 0 + offsetScroll.x,
         top = 0 + offsetScroll.y,
         right = containerCoordinates.right - containerBorder.right - width + offsetScroll.x,
         bottom = containerCoordinates.bottom - containerBorder.bottom - height + offsetScroll.y;

      if (this.options.includeMargins) {
         left += elementMargin.left;
         top += elementMargin.top;
      } else {
         right += elementMargin.right;
         bottom += elementMargin.bottom;
      }

      if (element.getStyle('position') == 'relative') {
         var coords = element.getCoordinates(offsetParent);
         coords.left -= element.getStyle('left').toInt();
         coords.top -= element.getStyle('top').toInt();

         left -= coords.left;
         top -= coords.top;
         if (container.getStyle('position') != 'relative') {
            left += containerBorder.left;
            top += containerBorder.top;
         }
         right += elementMargin.left - coords.left;
         bottom += elementMargin.top - coords.top;

         if (container != offsetParent) {
            left += containerMargin.left + offsetParentPadding.left;
            if (!offsetParentPadding.left && left < 0) left = 0;
            top +=
               offsetParent == document.body ? 0 : containerMargin.top + offsetParentPadding.top;
            if (!offsetParentPadding.top && top < 0) top = 0;
         }
      } else {
         left -= elementMargin.left;
         top -= elementMargin.top;
         if (container != offsetParent) {
            left += containerCoordinates.left + containerBorder.left;
            top += containerCoordinates.top + containerBorder.top;
         }
      }

      return {
         x: [left, right],
         y: [top, bottom],
      };
   },

   getDroppableCoordinates: function (element) {
      var position = element.getCoordinates();
      if (element.getStyle('position') == 'fixed') {
         var scroll = window.getScroll();
         position.left += scroll.x;
         position.right += scroll.x;
         position.top += scroll.y;
         position.bottom += scroll.y;
      }
      return position;
   },

   checkDroppables: function () {
      var overed = this.droppables
         .filter(function (el, i) {
            el = this.positions ? this.positions[i] : this.getDroppableCoordinates(el);
            var now = this.mouse.now;
            return now.x > el.left && now.x < el.right && now.y < el.bottom && now.y > el.top;
         }, this)
         .getLast();

      if (this.overed != overed) {
         if (this.overed) this.fireEvent('leave', [this.element, this.overed]);
         if (overed) this.fireEvent('enter', [this.element, overed]);
         this.overed = overed;
      }
   },

   drag: function (event) {
      this.parent(event);
      if (this.options.checkDroppables && this.droppables.length) this.checkDroppables();
   },

   stop: function (event) {
      this.checkDroppables();
      this.fireEvent('drop', [this.element, this.overed, event]);
      this.overed = null;
      return this.parent(event);
   },
});

Element.implement({
   makeDraggable: function (options) {
      var drag = new Drag.Move(this, options);
      this.store('dragger', drag);
      return drag;
   },
});

/*
---

script: Sortables.js

name: Sortables

description: Class for creating a drag and drop sorting interface for lists of items.

license: MIT-style license

authors:
  - Tom Occhino

requires:
  - Core/Fx.Morph
  - Drag.Move

provides: [Sortables]

...
*/
(function () {
   var Sortables = (this.Sortables = new Class({
      Implements: [Events, Options],

      options: {
         /*
		onSort: function(element, clone){},
		onStart: function(element, clone){},
		onComplete: function(element){},*/
         opacity: 1,
         clone: false,
         revert: false,
         handle: false,
         dragOptions: {},
         unDraggableTags: ['button', 'input', 'a', 'textarea', 'select', 'option'],
      },

      initialize: function (lists, options) {
         this.setOptions(options);

         this.elements = [];
         this.lists = [];
         this.idle = true;

         this.addLists($$(document.id(lists) || lists));

         if (!this.options.clone) this.options.revert = false;
         if (this.options.revert)
            this.effect = new Fx.Morph(
               null,
               Object.merge(
                  {
                     duration: 250,
                     link: 'cancel',
                  },
                  this.options.revert
               )
            );
      },

      attach: function () {
         this.addLists(this.lists);
         return this;
      },

      detach: function () {
         this.lists = this.removeLists(this.lists);
         return this;
      },

      addItems: function () {
         Array.flatten(arguments).each(function (element) {
            this.elements.push(element);
            var start = element.retrieve(
               'sortables:start',
               function (event) {
                  this.start.call(this, event, element);
               }.bind(this)
            );
            (this.options.handle
               ? element.getElement(this.options.handle) || element
               : element
            ).addEvent('mousedown', start);
         }, this);
         return this;
      },

      addLists: function () {
         Array.flatten(arguments).each(function (list) {
            this.lists.include(list);
            this.addItems(list.getChildren());
         }, this);
         return this;
      },

      removeItems: function () {
         return $$(
            Array.flatten(arguments).map(function (element) {
               this.elements.erase(element);
               var start = element.retrieve('sortables:start');
               (this.options.handle
                  ? element.getElement(this.options.handle) || element
                  : element
               ).removeEvent('mousedown', start);

               return element;
            }, this)
         );
      },

      removeLists: function () {
         return $$(
            Array.flatten(arguments).map(function (list) {
               this.lists.erase(list);
               this.removeItems(list.getChildren());

               return list;
            }, this)
         );
      },

      getDroppableCoordinates: function (element) {
         var offsetParent = element.getOffsetParent();
         var position = element.getPosition(offsetParent);
         var scroll = {
            w: window.getScroll(),
            offsetParent: offsetParent.getScroll(),
         };
         position.x += scroll.offsetParent.x;
         position.y += scroll.offsetParent.y;

         if (offsetParent.getStyle('position') == 'fixed') {
            position.x -= scroll.w.x;
            position.y -= scroll.w.y;
         }

         return position;
      },

      getClone: function (event, element) {
         if (!this.options.clone) return new Element(element.tagName).inject(document.body);
         if (typeOf(this.options.clone) == 'function')
            return this.options.clone.call(this, event, element, this.list);
         var clone = element
            .clone(true)
            .setStyles({
               margin: 0,
               position: 'absolute',
               visibility: 'hidden',
               width: element.getStyle('width'),
            })
            .addEvent('mousedown', function (event) {
               element.fireEvent('mousedown', event);
            });
         //prevent the duplicated radio inputs from unchecking the real one
         if (clone.get('html').test('radio')) {
            clone.getElements('input[type=radio]').each(function (input, i) {
               input.set('name', 'clone_' + i);
               if (input.get('checked'))
                  element.getElements('input[type=radio]')[i].set('checked', true);
            });
         }

         return clone.inject(this.list).setPosition(this.getDroppableCoordinates(this.element));
      },

      getDroppables: function () {
         var droppables = this.list.getChildren().erase(this.clone).erase(this.element);
         if (!this.options.constrain) droppables.append(this.lists).erase(this.list);
         return droppables;
      },

      insert: function (dragging, element) {
         var where = 'inside';
         if (this.lists.contains(element)) {
            this.list = element;
            this.drag.droppables = this.getDroppables();
         } else {
            where = this.element.getAllPrevious().contains(element) ? 'before' : 'after';
         }
         this.element.inject(element, where);
         this.fireEvent('sort', [this.element, this.clone]);
      },

      start: function (event, element) {
         if (
            !this.idle ||
            event.rightClick ||
            (!this.options.handle && this.options.unDraggableTags.contains(event.target.get('tag')))
         )
            return;

         this.idle = false;
         this.element = element;
         this.opacity = element.getStyle('opacity');
         this.list = element.getParent();
         this.clone = this.getClone(event, element);

         this.drag = new Drag.Move(
            this.clone,
            Object.merge(
               {
                  droppables: this.getDroppables(),
               },
               this.options.dragOptions
            )
         ).addEvents({
            onSnap: function () {
               event.stop();
               this.clone.setStyle('visibility', 'visible');
               this.element.setStyle('opacity', this.options.opacity || 0);
               this.fireEvent('start', [this.element, this.clone]);
            }.bind(this),
            onEnter: this.insert.bind(this),
            onCancel: this.end.bind(this),
            onComplete: this.end.bind(this),
         });

         this.clone.inject(this.element, 'before');
         this.drag.start(event);
      },

      end: function () {
         this.drag.detach();
         this.element.setStyle('opacity', this.opacity);
         var self = this;
         if (this.effect) {
            var dim = this.element.getStyles('width', 'height'),
               clone = this.clone,
               pos = clone.computePosition(this.getDroppableCoordinates(clone));

            var destroy = function () {
               this.removeEvent('cancel', destroy);
               clone.destroy();
               self.reset();
            };

            this.effect.element = clone;
            this.effect
               .start({
                  top: pos.top,
                  left: pos.left,
                  width: dim.width,
                  height: dim.height,
                  opacity: 0.25,
               })
               .addEvent('cancel', destroy)
               .chain(destroy);
         } else {
            this.clone.destroy();
            self.reset();
         }
      },

      reset: function () {
         this.idle = true;
         this.fireEvent('complete', this.element);
      },

      serialize: function () {
         var params = Array.link(arguments, {
            modifier: Type.isFunction,
            index: function (obj) {
               return obj != null;
            },
         });
         var serial = this.lists.map(function (list) {
            return list.getChildren().map(
               params.modifier ||
                  function (element) {
                     return element.get('id');
                  },
               this
            );
         }, this);

         var index = params.index;
         if (this.lists.length == 1) index = 0;
         return (index || index === 0) && index >= 0 && index < this.lists.length
            ? serial[index]
            : serial;
      },
   }));
})();

/*
---

name: Events.Pseudos

description: Adds the functionality to add pseudo events

license: MIT-style license

authors:
  - Arian Stolwijk

requires: [Core/Class.Extras, Core/Slick.Parser, MooTools.More]

provides: [Events.Pseudos]

...
*/

(function () {
   Events.Pseudos = function (pseudos, addEvent, removeEvent) {
      var storeKey = '_monitorEvents:';

      var storageOf = function (object) {
         return {
            store: object.store
               ? function (key, value) {
                    object.store(storeKey + key, value);
                 }
               : function (key, value) {
                    (object._monitorEvents || (object._monitorEvents = {}))[key] = value;
                 },
            retrieve: object.retrieve
               ? function (key, dflt) {
                    return object.retrieve(storeKey + key, dflt);
                 }
               : function (key, dflt) {
                    if (!object._monitorEvents) return dflt;
                    return object._monitorEvents[key] || dflt;
                 },
         };
      };

      var splitType = function (type) {
         if (type.indexOf(':') == -1 || !pseudos) return null;

         var parsed = Slick.parse(type).expressions[0][0],
            parsedPseudos = parsed.pseudos,
            l = parsedPseudos.length,
            splits = [];

         while (l--) {
            var pseudo = parsedPseudos[l].key,
               listener = pseudos[pseudo];
            if (listener != null)
               splits.push({
                  event: parsed.tag,
                  value: parsedPseudos[l].value,
                  pseudo: pseudo,
                  original: type,
                  listener: listener,
               });
         }
         return splits.length ? splits : null;
      };

      return {
         addEvent: function (type, fn, internal) {
            var split = splitType(type);
            if (!split) return addEvent.call(this, type, fn, internal);

            var storage = storageOf(this),
               events = storage.retrieve(type, []),
               eventType = split[0].event,
               args = Array.slice(arguments, 2),
               stack = fn,
               self = this;

            split.each(function (item) {
               var listener = item.listener,
                  stackFn = stack;
               if (listener == false) eventType += ':' + item.pseudo + '(' + item.value + ')';
               else
                  stack = function () {
                     listener.call(self, item, stackFn, arguments, stack);
                  };
            });

            events.include({ type: eventType, event: fn, monitor: stack });
            storage.store(type, events);

            if (type != eventType) addEvent.apply(this, [type, fn].concat(args));
            return addEvent.apply(this, [eventType, stack].concat(args));
         },

         removeEvent: function (type, fn) {
            var split = splitType(type);
            if (!split) return removeEvent.call(this, type, fn);

            var storage = storageOf(this),
               events = storage.retrieve(type);
            if (!events) return this;

            var args = Array.slice(arguments, 2);

            removeEvent.apply(this, [type, fn].concat(args));
            events.each(function (monitor, i) {
               if (!fn || monitor.event == fn)
                  removeEvent.apply(this, [monitor.type, monitor.monitor].concat(args));
               delete events[i];
            }, this);

            storage.store(type, events);
            return this;
         },
      };
   };

   var pseudos = {
      once: function (split, fn, args, monitor) {
         fn.apply(this, args);
         this.removeEvent(split.event, monitor).removeEvent(split.original, fn);
      },

      throttle: function (split, fn, args) {
         if (!fn._throttled) {
            fn.apply(this, args);
            fn._throttled = setTimeout(function () {
               fn._throttled = false;
            }, split.value || 250);
         }
      },

      pause: function (split, fn, args) {
         clearTimeout(fn._pause);
         fn._pause = fn.delay(split.value || 250, this, args);
      },
   };

   Events.definePseudo = function (key, listener) {
      pseudos[key] = listener;
      return this;
   };

   Events.lookupPseudo = function (key) {
      return pseudos[key];
   };

   var proto = Events.prototype;
   Events.implement(Events.Pseudos(pseudos, proto.addEvent, proto.removeEvent));

   ['Request', 'Fx'].each(function (klass) {
      if (this[klass]) this[klass].implement(Events.prototype);
   });
})();

/*
---

name: Element.Event.Pseudos

description: Adds the functionality to add pseudo events for Elements

license: MIT-style license

authors:
  - Arian Stolwijk

requires: [Core/Element.Event, Core/Element.Delegation, Events.Pseudos]

provides: [Element.Event.Pseudos, Element.Delegation.Pseudo]

...
*/

(function () {
   var pseudos = { relay: false },
      copyFromEvents = ['once', 'throttle', 'pause'],
      count = copyFromEvents.length;

   while (count--) pseudos[copyFromEvents[count]] = Events.lookupPseudo(copyFromEvents[count]);

   DOMEvent.definePseudo = function (key, listener) {
      pseudos[key] = listener;
      return this;
   };

   var proto = Element.prototype;
   [Element, Window, Document].invoke(
      'implement',
      Events.Pseudos(pseudos, proto.addEvent, proto.removeEvent)
   );
})();

/*
---

name: Element.Event.Pseudos.Keys

description: Adds functionality fire events if certain keycombinations are pressed

license: MIT-style license

authors:
  - Arian Stolwijk

requires: [Element.Event.Pseudos]

provides: [Element.Event.Pseudos.Keys]

...
*/

(function () {
   var keysStoreKey = '$moo:keys-pressed',
      keysKeyupStoreKey = '$moo:keys-keyup';

   DOMEvent.definePseudo('keys', function (split, fn, args) {
      var event = args[0],
         keys = [],
         pressed = this.retrieve(keysStoreKey, []),
         value = split.value;

      if (value != '+')
         keys.append(
            value
               .replace('++', function () {
                  keys.push('+'); // shift++ and shift+++a
                  return '';
               })
               .split('+')
         );
      else keys = ['+'];

      pressed.include(event.key);

      if (
         keys.every(function (key) {
            return pressed.contains(key);
         })
      )
         fn.apply(this, args);

      this.store(keysStoreKey, pressed);

      if (!this.retrieve(keysKeyupStoreKey)) {
         var keyup = function (event) {
            (function () {
               pressed = this.retrieve(keysStoreKey, []).erase(event.key);
               this.store(keysStoreKey, pressed);
            }).delay(0, this); // Fix for IE
         };
         this.store(keysKeyupStoreKey, keyup).addEvent('keyup', keyup);
      }
   });

   DOMEvent.defineKeys({
      16: 'shift',
      17: 'control',
      18: 'alt',
      20: 'capslock',
      33: 'pageup',
      34: 'pagedown',
      35: 'end',
      36: 'home',
      144: 'numlock',
      145: 'scrolllock',
      186: ';',
      187: '=',
      188: ',',
      190: '.',
      191: '/',
      192: '`',
      219: '[',
      220: '\\',
      221: ']',
      222: "'",
      107: '+',
      109: '-', // subtract
      189: '-', // dash
   });
})();

/*
---

script: Element.Pin.js

name: Element.Pin

description: Extends the Element native object to include the pin method useful for fixed positioning for elements.

license: MIT-style license

authors:
  - Aaron Newton

requires:
  - Core/Element.Event
  - Core/Element.Dimensions
  - Core/Element.Style
  - MooTools.More

provides: [Element.Pin]

...
*/

(function () {
   var supportsPositionFixed = false,
      supportTested = false;

   var testPositionFixed = function () {
      var test = new Element('div')
         .setStyles({
            position: 'fixed',
            top: 0,
            right: 0,
         })
         .inject(document.body);
      supportsPositionFixed = test.offsetTop === 0;
      test.dispose();
      supportTested = true;
   };

   Element.implement({
      pin: function (enable, forceScroll) {
         if (!supportTested) testPositionFixed();
         if (this.getStyle('display') == 'none') return this;

         var pinnedPosition,
            scroll = window.getScroll(),
            parent,
            scrollFixer;

         if (enable !== false) {
            pinnedPosition = this.getPosition();
            if (!this.retrieve('pin:_pinned')) {
               var currentPosition = {
                  top: pinnedPosition.y - scroll.y,
                  left: pinnedPosition.x - scroll.x,
                  margin: '0px',
                  padding: '0px',
               };

               if (supportsPositionFixed && !forceScroll) {
                  this.setStyle('position', 'fixed').setStyles(currentPosition);
               } else {
                  parent = this.getOffsetParent();
                  var position = this.getPosition(parent),
                     styles = this.getStyles('left', 'top');

                  if ((parent && styles.left == 'auto') || styles.top == 'auto')
                     this.setPosition(position);
                  if (this.getStyle('position') == 'static') this.setStyle('position', 'absolute');

                  position = {
                     x: styles.left.toInt() - scroll.x,
                     y: styles.top.toInt() - scroll.y,
                  };

                  scrollFixer = function () {
                     if (!this.retrieve('pin:_pinned')) return;
                     var scroll = window.getScroll();
                     this.setStyles({
                        left: position.x + scroll.x,
                        top: position.y + scroll.y,
                     });
                  }.bind(this);

                  this.store('pin:_scrollFixer', scrollFixer);
                  window.addEvent('scroll', scrollFixer);
               }
               this.store('pin:_pinned', true);
            }
         } else {
            if (!this.retrieve('pin:_pinned')) return this;

            parent = this.getParent();
            var offsetParent =
               parent.getComputedStyle('position') != 'static' ? parent : parent.getOffsetParent();

            pinnedPosition = this.getPosition();

            this.store('pin:_pinned', false);
            scrollFixer = this.retrieve('pin:_scrollFixer');
            if (!scrollFixer) {
               this.setStyles({
                  position: 'absolute',
                  top: pinnedPosition.y + scroll.y,
                  left: pinnedPosition.x + scroll.x,
               });
            } else {
               this.store('pin:_scrollFixer', null);
               window.removeEvent('scroll', scrollFixer);
            }
            this.removeClass('isPinned');
         }
         return this;
      },

      unpin: function () {
         return this.pin(false);
      },

      togglePin: function () {
         return this.pin(!this.retrieve('pin:_pinned'));
      },
   });
})();

/*
---

script: Element.Shortcuts.js

name: Element.Shortcuts

description: Extends the Element native object to include some shortcut methods.

license: MIT-style license

authors:
  - Aaron Newton

requires:
  - Core/Element.Style
  - MooTools.More

provides: [Element.Shortcuts]

...
*/

Element.implement({
   isDisplayed: function () {
      return this.getStyle('display') != 'none';
   },

   isVisible: function () {
      var w = this.offsetWidth,
         h = this.offsetHeight;
      return w == 0 && h == 0 ? false : w > 0 && h > 0 ? true : this.style.display != 'none';
   },

   toggle: function () {
      return this[this.isDisplayed() ? 'hide' : 'show']();
   },

   hide: function () {
      var d;
      try {
         //IE fails here if the element is not in the dom
         d = this.getStyle('display');
      } catch (e) {}
      if (d == 'none') return this;
      return this.store('element:_originalDisplay', d || '').setStyle('display', 'none');
   },

   show: function (display) {
      if (!display && this.isDisplayed()) return this;
      display = display || this.retrieve('element:_originalDisplay') || 'block';
      return this.setStyle('display', display == 'none' ? 'block' : display);
   },

   swapClass: function (remove, add) {
      return this.removeClass(remove).addClass(add);
   },
});

Document.implement({
   clearSelection: function () {
      if (window.getSelection) {
         var selection = window.getSelection();
         if (selection && selection.removeAllRanges) selection.removeAllRanges();
      } else if (document.selection && document.selection.empty) {
         try {
            //IE fails here if selected element is not in dom
            document.selection.empty();
         } catch (e) {}
      }
   },
});

/*
---

script: String.QueryString.js

name: String.QueryString

description: Methods for dealing with URI query strings.

license: MIT-style license

authors:
  - Sebastian Markbåge
  - Aaron Newton
  - Lennart Pilon
  - Valerio Proietti

requires:
  - Core/Array
  - Core/String
  - MooTools.More

provides: [String.QueryString]

...
*/

(function () {
   /**
    * decodeURIComponent doesn't do the correct thing with query parameter keys or
    * values. Specifically, it leaves '+' as '+' when it should be converting them
    * to spaces as that's the specification. When browsers submit HTML forms via
    * GET, the values are encoded using 'application/x-www-form-urlencoded'
    * which converts spaces to '+'.
    *
    * See: http://unixpapa.com/js/querystring.html for a description of the
    * problem.
    */
   var decodeComponent = function (str) {
      return decodeURIComponent(str.replace(/\+/g, ' '));
   };

   String.implement({
      parseQueryString: function (decodeKeys, decodeValues) {
         if (decodeKeys == null) decodeKeys = true;
         if (decodeValues == null) decodeValues = true;

         var vars = this.split(/[&;]/),
            object = {};
         if (!vars.length) return object;

         vars.each(function (val) {
            var index = val.indexOf('=') + 1,
               value = index ? val.substr(index) : '',
               keys = index ? val.substr(0, index - 1).match(/([^\]\[]+|(\B)(?=\]))/g) : [val],
               obj = object;
            if (!keys) return;
            if (decodeValues) value = decodeComponent(value);
            keys.each(function (key, i) {
               if (decodeKeys) key = decodeComponent(key);
               var current = obj[key];

               if (i < keys.length - 1) obj = obj[key] = current || {};
               else if (typeOf(current) == 'array') current.push(value);
               else obj[key] = current != null ? [current, value] : value;
            });
         });

         return object;
      },

      cleanQueryString: function (method) {
         return this.split('&')
            .filter(function (val) {
               var index = val.indexOf('='),
                  key = index < 0 ? '' : val.substr(0, index),
                  value = val.substr(index + 1);

               return method ? method.call(null, key, value) : value || value === 0;
            })
            .join('&');
      },
   });
})();

/*
---

name: Hash

description: Contains Hash Prototypes. Provides a means for overcoming the JavaScript practical impossibility of extending native Objects.

license: MIT-style license.

requires:
  - Core/Object
  - MooTools.More

provides: [Hash]

...
*/

(function () {
   if (this.Hash) return;

   var Hash = (this.Hash = new Type('Hash', function (object) {
      if (typeOf(object) == 'hash') object = Object.clone(object.getClean());
      for (var key in object) this[key] = object[key];
      return this;
   }));

   this.$H = function (object) {
      return new Hash(object);
   };

   Hash.implement({
      forEach: function (fn, bind) {
         Object.forEach(this, fn, bind);
      },

      getClean: function () {
         var clean = {};
         for (var key in this) {
            if (this.hasOwnProperty(key)) clean[key] = this[key];
         }
         return clean;
      },

      getLength: function () {
         var length = 0;
         for (var key in this) {
            if (this.hasOwnProperty(key)) length++;
         }
         return length;
      },
   });

   Hash.alias('each', 'forEach');

   Hash.implement({
      has: Object.prototype.hasOwnProperty,

      keyOf: function (value) {
         return Object.keyOf(this, value);
      },

      hasValue: function (value) {
         return Object.contains(this, value);
      },

      extend: function (properties) {
         Hash.each(
            properties || {},
            function (value, key) {
               Hash.set(this, key, value);
            },
            this
         );
         return this;
      },

      combine: function (properties) {
         Hash.each(
            properties || {},
            function (value, key) {
               Hash.include(this, key, value);
            },
            this
         );
         return this;
      },

      erase: function (key) {
         if (this.hasOwnProperty(key)) delete this[key];
         return this;
      },

      get: function (key) {
         return this.hasOwnProperty(key) ? this[key] : null;
      },

      set: function (key, value) {
         if (!this[key] || this.hasOwnProperty(key)) this[key] = value;
         return this;
      },

      empty: function () {
         Hash.each(
            this,
            function (value, key) {
               delete this[key];
            },
            this
         );
         return this;
      },

      include: function (key, value) {
         if (this[key] == undefined) this[key] = value;
         return this;
      },

      map: function (fn, bind) {
         return new Hash(Object.map(this, fn, bind));
      },

      filter: function (fn, bind) {
         return new Hash(Object.filter(this, fn, bind));
      },

      every: function (fn, bind) {
         return Object.every(this, fn, bind);
      },

      some: function (fn, bind) {
         return Object.some(this, fn, bind);
      },

      getKeys: function () {
         return Object.keys(this);
      },

      getValues: function () {
         return Object.values(this);
      },

      toQueryString: function (base) {
         return Object.toQueryString(this, base);
      },
   });

   Hash.alias({ indexOf: 'keyOf', contains: 'hasValue' });
})();

/*
---

script: URI.js

name: URI

description: Provides methods useful in managing the window location and uris.

license: MIT-style license

authors:
  - Sebastian Markbåge
  - Aaron Newton

requires:
  - Core/Object
  - Core/Class
  - Core/Class.Extras
  - Core/Element
  - String.QueryString

provides: [URI]

...
*/

(function () {
   var toString = function () {
      return this.get('value');
   };

   var URI = (this.URI = new Class({
      Implements: Options,

      options: {
         /*base: false*/
      },

      regex: /^(?:(\w+):)?(?:\/\/(?:(?:([^:@\/]*):?([^:@\/]*))?@)?(\[[A-Fa-f0-9:]+\]|[^:\/?#]*)(?::(\d*))?)?(\.\.?$|(?:[^?#\/]*\/)*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?/,
      parts: [
         'scheme',
         'user',
         'password',
         'host',
         'port',
         'directory',
         'file',
         'query',
         'fragment',
      ],
      schemes: { http: 80, https: 443, ftp: 21, rtsp: 554, mms: 1755, file: 0 },

      initialize: function (uri, options) {
         this.setOptions(options);
         var base = this.options.base || URI.base;
         if (!uri) uri = base;

         if (uri && uri.parsed) this.parsed = Object.clone(uri.parsed);
         else this.set('value', uri.href || uri.toString(), base ? new URI(base) : false);
      },

      parse: function (value, base) {
         var bits = value.match(this.regex);
         if (!bits) return false;
         bits.shift();
         return this.merge(bits.associate(this.parts), base);
      },

      merge: function (bits, base) {
         if ((!bits || !bits.scheme) && (!base || !base.scheme)) return false;
         if (base) {
            this.parts.every(function (part) {
               if (bits[part]) return false;
               bits[part] = base[part] || '';
               return true;
            });
         }
         bits.port = bits.port || this.schemes[bits.scheme.toLowerCase()];
         bits.directory = bits.directory
            ? this.parseDirectory(bits.directory, base ? base.directory : '')
            : '/';
         return bits;
      },

      parseDirectory: function (directory, baseDirectory) {
         directory = (directory.substr(0, 1) == '/' ? '' : baseDirectory || '/') + directory;
         if (!directory.test(URI.regs.directoryDot)) return directory;
         var result = [];
         directory
            .replace(URI.regs.endSlash, '')
            .split('/')
            .each(function (dir) {
               if (dir == '..' && result.length > 0) result.pop();
               else if (dir != '.') result.push(dir);
            });
         return result.join('/') + '/';
      },

      combine: function (bits) {
         return (
            bits.value ||
            bits.scheme +
               '://' +
               (bits.user ? bits.user + (bits.password ? ':' + bits.password : '') + '@' : '') +
               (bits.host || '') +
               (bits.port && bits.port != this.schemes[bits.scheme] ? ':' + bits.port : '') +
               (bits.directory || '/') +
               (bits.file || '') +
               (bits.query ? '?' + bits.query : '') +
               (bits.fragment ? '#' + bits.fragment : '')
         );
      },

      set: function (part, value, base) {
         if (part == 'value') {
            var scheme = value.match(URI.regs.scheme);
            if (scheme) scheme = scheme[1];
            if (scheme && this.schemes[scheme.toLowerCase()] == null)
               this.parsed = { scheme: scheme, value: value };
            else
               this.parsed =
                  this.parse(value, (base || this).parsed) ||
                  (scheme ? { scheme: scheme, value: value } : { value: value });
         } else if (part == 'data') {
            this.setData(value);
         } else {
            this.parsed[part] = value;
         }
         return this;
      },

      get: function (part, base) {
         switch (part) {
            case 'value':
               return this.combine(this.parsed, base ? base.parsed : false);
            case 'data':
               return this.getData();
         }
         return this.parsed[part] || '';
      },

      go: function () {
         document.location.href = this.toString();
      },

      toURI: function () {
         return this;
      },

      getData: function (key, part) {
         var qs = this.get(part || 'query');
         if (!(qs || qs === 0)) return key ? null : {};
         var obj = qs.parseQueryString();
         return key ? obj[key] : obj;
      },

      setData: function (values, merge, part) {
         if (typeof values == 'string') {
            var data = this.getData();
            data[arguments[0]] = arguments[1];
            values = data;
         } else if (merge) {
            values = Object.merge(this.getData(null, part), values);
         }
         return this.set(part || 'query', Object.toQueryString(values));
      },

      clearData: function (part) {
         return this.set(part || 'query', '');
      },

      toString: toString,
      valueOf: toString,
   }));

   URI.regs = {
      endSlash: /\/$/,
      scheme: /^(\w+):/,
      directoryDot: /\.\/|\.$/,
   };

   URI.base = new URI(Array.convert(document.getElements('base[href]', true)).getLast(), {
      base: document.location,
   });

   String.implement({
      toURI: function (options) {
         return new URI(this, options);
      },
   });
})();

/*
---

script: URI.Relative.js

name: URI.Relative

description: Extends the URI class to add methods for computing relative and absolute urls.

license: MIT-style license

authors:
  - Sebastian Markbåge


requires:
  - Class.refactor
  - URI

provides: [URI.Relative]

...
*/

URI = Class.refactor(URI, {
   combine: function (bits, base) {
      if (!base || bits.scheme != base.scheme || bits.host != base.host || bits.port != base.port)
         return this.previous.apply(this, arguments);
      var end =
         bits.file +
         (bits.query ? '?' + bits.query : '') +
         (bits.fragment ? '#' + bits.fragment : '');

      if (!base.directory) return (bits.directory || (bits.file ? '' : './')) + end;

      var baseDir = base.directory.split('/'),
         relDir = bits.directory.split('/'),
         path = '',
         offset;

      var i = 0;
      for (
         offset = 0;
         offset < baseDir.length && offset < relDir.length && baseDir[offset] == relDir[offset];
         offset++
      );
      for (i = 0; i < baseDir.length - offset - 1; i++) path += '../';
      for (i = offset; i < relDir.length - 1; i++) path += relDir[i] + '/';

      return (path || (bits.file ? '' : './')) + end;
   },

   toAbsolute: function (base) {
      base = new URI(base);
      if (base) base.set('directory', '').set('file', '');
      return this.toRelative(base);
   },

   toRelative: function (base) {
      return this.get('value', new URI(base));
   },
});

/*
---

script: Assets.js

name: Assets

description: Provides methods to dynamically load JavaScript, CSS, and Image files into the document.

license: MIT-style license

authors:
  - Valerio Proietti

requires:
  - Core/Element.Event
  - MooTools.More

provides: [Assets, Asset.javascript, Asset.css, Asset.image, Asset.images]

...
*/
(function () {
   var Asset = (this.Asset = {
      javascript: function (source, properties) {
         if (!properties) properties = {};

         var script = new Element('script', { src: source, type: 'text/javascript' }),
            doc = properties.document || document,
            load = properties.onload || properties.onLoad;

         delete properties.onload;
         delete properties.onLoad;
         delete properties.document;

         if (load) {
            if (!script.addEventListener) {
               script.addEvent('readystatechange', function () {
                  if (['loaded', 'complete'].contains(this.readyState)) load.call(this);
               });
            } else {
               script.addEvent('load', load);
            }
         }

         return script.set(properties).inject(doc.head);
      },

      css: function (source, properties) {
         if (!properties) properties = {};

         var load = properties.onload || properties.onLoad,
            doc = properties.document || document,
            timeout = properties.timeout || 3000;

         ['onload', 'onLoad', 'document'].each(function (prop) {
            delete properties[prop];
         });

         var link = new Element('link', {
            type: 'text/css',
            rel: 'stylesheet',
            media: 'screen',
            href: source,
         })
            .setProperties(properties)
            .inject(doc.head);

         if (load) {
            // based on article at http://www.yearofmoo.com/2011/03/cross-browser-stylesheet-preloading.html
            var loaded = false,
               retries = 0;
            var check = function () {
               var stylesheets = document.styleSheets;
               for (var i = 0; i < stylesheets.length; i++) {
                  var file = stylesheets[i];
                  var owner = file.ownerNode ? file.ownerNode : file.owningElement;
                  if (owner && owner == link) {
                     loaded = true;
                     return load.call(link);
                  }
               }
               retries++;
               if (!loaded && retries < timeout / 50) return setTimeout(check, 50);
            };
            setTimeout(check, 0);
         }
         return link;
      },

      image: function (source, properties) {
         if (!properties) properties = {};

         var image = new Image(),
            element = document.id(image) || new Element('img');

         ['load', 'abort', 'error'].each(function (name) {
            var type = 'on' + name,
               cap = 'on' + name.capitalize(),
               event = properties[type] || properties[cap] || function () {};

            delete properties[cap];
            delete properties[type];

            image[type] = function () {
               if (!image) return;
               if (!element.parentNode) {
                  element.width = image.width;
                  element.height = image.height;
               }
               image = image.onload = image.onabort = image.onerror = null;
               event.delay(1, element, element);
               element.fireEvent(name, element, 1);
            };
         });

         image.src = element.src = source;
         if (image && image.complete) image.onload.delay(1);
         return element.set(properties);
      },

      images: function (sources, options) {
         sources = Array.convert(sources);

         var fn = function () {},
            counter = 0;

         options = Object.merge(
            {
               onComplete: fn,
               onProgress: fn,
               onError: fn,
               properties: {},
            },
            options
         );

         return new Elements(
            sources.map(function (source, index) {
               return Asset.image(
                  source,
                  Object.append(options.properties, {
                     onload: function () {
                        counter++;
                        options.onProgress.call(this, counter, index, source);
                        if (counter == sources.length) options.onComplete();
                     },
                     onerror: function () {
                        counter++;
                        options.onError.call(this, counter, index, source);
                        if (counter == sources.length) options.onComplete();
                     },
                  })
               );
            })
         );
      },
   });
})();
