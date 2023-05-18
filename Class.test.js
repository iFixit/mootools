require('./MooTools-Core-1.6.0.js');

describe('Class', () => {
   it('creates a new JS class', () => {
      const C = new Class({});
      expect(new C()).toBeInstanceOf(C);
   });
});
