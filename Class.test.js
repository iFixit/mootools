require('./MooTools-Core-1.6.0.js');

describe('Basics', () => {
   it('creates a new JS class', () => {
      const C = new Class({});
      expect(new C()).toBeInstanceOf(C);
   });

   it('supports being passed a constructor function', () => {
      const C = new Class(function (name) {
         this.name = name;
      });
      const instance = new C('fish');
      expect(instance).toBeInstanceOf(C);
      expect(instance.name).toBe('fish');
   });
});

describe('Extends', () => {
   it('uses Extends to extend classes', () => {
      const Parent = new Class();

      const C = new Class({
         Extends: Parent,
      });

      expect(new C()).toBeInstanceOf(C);
      expect(new C()).toBeInstanceOf(Parent);
   });

   /** See tests below; there are many caveats around this */
   it('can extend native JS classes', () => {
      class Parent {}

      const C = new Class({
         Extends: Parent,
      });

      expect(new C()).toBeInstanceOf(C);
      expect(new C()).toBeInstanceOf(Parent);
   });

   it('calls the parent constructor when creating a new Class', () => {
      const constructor = jest.fn();
      class Parent {
         constructor() {
            constructor();
         }
      }

      new Class({
         Extends: Parent,
      });

      expect(constructor).toHaveBeenCalled();
   });

   it('does not call the parent constructor when instantiating a Class', () => {
      const constructor = jest.fn();
      class Parent {
         constructor() {
            constructor();
         }
      }

      const C = new Class({
         Extends: Parent,
      });

      new C();

      expect(constructor).toHaveBeenCalledTimes(1);
   });

   it('calls the parent `initialize` method with the arguments when instantiating a Class', () => {
      const constructor = jest.fn();
      const initialize = jest.fn();
      class Parent {
         constructor() {
            constructor();
         }

         initialize(name) {
            initialize(name);
         }
      }

      const C = new Class({
         Extends: Parent,
      });

      new C('fish');
      new C('frogs');

      expect(constructor).toHaveBeenCalledTimes(1);
      expect(initialize).toHaveBeenCalledTimes(2);
      expect(initialize).toHaveBeenLastCalledWith('frogs');
   });

   it('distinguishes the parent instance variables', () => {
      class Parent {
         constructor() {
            this.name = 'default';
         }

         setName(name) {
            this.name = name;
         }
      }

      const C = new Class({
         Extends: Parent,
      });

      const i = new C();
      const j = new C();

      i.name = 'fish';
      j.name = 'frogs';

      expect(i.name).toBe('fish');
      expect(j.name).toBe('frogs');
   });

   it('uses parent methods correctly', () => {
      class Parent {
         name = 'default';

         setName(name) {
            this.name = name;
         }
      }

      const C = new Class({
         Extends: Parent,
      });

      const i = new C();
      const j = new C();

      i.setName('fish');
      j.setName('frogs');

      expect(i.name).toBe('fish');
      expect(j.name).toBe('frogs');
   });

   it('does not support private fields in parent classes', () => {
      class Parent {
         #name = 'default';

         setName(name) {
            this.#name = name;
         }
      }

      const C = new Class({
         Extends: Parent,
      });

      const i = new C();
      expect(() => i.setName('fish')).toThrow(TypeError);
   });

   it('can be extended by native JS classes', () => {
      const Parent = new Class({
         initialize() {
            this.name = 'fish';
         },
      });

      expect(new Parent().name).toBe('fish');

      class C extends Parent {}

      const i = new C();
      expect(i).toBeInstanceOf(C);
      expect(i).toBeInstanceOf(Parent);
      expect(i.name).toBe('fish');
   });
});

describe('Implements', () => {
   it('does not inherit from the parent class', () => {
      const Parent = new Class({});

      const C = new Class({
         Implements: Parent,
      });

      expect(new C()).not.toBeInstanceOf(Parent);
   });

   it('copies methods to the new class', () => {
      const parent = jest.fn();
      const Parent = new Class({
         parentMethod(arg) {
            parent(arg);
         },
      });
      const C = new Class({
         Implements: Parent,
      });

      const i = new C();
      i.parentMethod('fish');

      expect(i).not.toBeInstanceOf(Parent);
      expect(parent).toHaveBeenCalledWith('fish');
   });
});
