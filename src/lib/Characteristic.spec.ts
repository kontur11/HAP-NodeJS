import {
  Access,
  Characteristic,
  CharacteristicChange,
  CharacteristicEventTypes,
  CharacteristicProps,
  Formats,
  HAPStatus,
  Perms,
  SerializedCharacteristic,
  Units,
  uuid
} from '..';

function createCharacteristic(type: Formats, customUUID?: string): Characteristic {
  return new Characteristic('Test', customUUID || uuid.generate('Foo'), { format: type, perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE] });
}

function createCharacteristicWithProps(props: CharacteristicProps, customUUID?: string): Characteristic {
  return new Characteristic('Test', customUUID || uuid.generate('Foo'), props);
}

describe('Characteristic', () => {

  describe('#setProps()', () => {
    it('should overwrite existing properties', () => {
      const characteristic = createCharacteristic(Formats.BOOL);

      const NEW_PROPS = {format: Formats.STRING, perms: [Perms.NOTIFY]};
      characteristic.setProps(NEW_PROPS);

      expect(characteristic.props).toEqual(NEW_PROPS);
    });

    it('should fail when setting invalid value range', function () {
      const characteristic = createCharacteristic(Formats.INT);

      const setProps = (min: number, max: number) => characteristic.setProps({
        minValue: min,
        maxValue: max,
      })

      expect(() => setProps(-256, -512)).toThrow(Error);
      expect(() => setProps(0, -3)).toThrow(Error);
      expect(() => setProps(6, 0)).toThrow(Error);
      expect(() => setProps(678, 234)).toThrow(Error);

      // should allow setting equal values
      setProps(0, 0);
      setProps(3, 3);
    });
  });

  describe("validValuesIterator", () => {
    it ("should iterate over min/max value definition", () => {
      const characteristic = createCharacteristicWithProps({
        format: Formats.INT,
        perms: [Perms.PAIRED_READ],
        minValue: 2,
        maxValue: 5,
      });

      const result = Array.from(characteristic.validValuesIterator());
      expect(result).toEqual([2, 3, 4, 5]);
    });

    it ("should iterate over min/max value definition with minStep defined", () => {
      const characteristic = createCharacteristicWithProps({
        format: Formats.INT,
        perms: [Perms.PAIRED_READ],
        minValue: 2,
        maxValue: 10,
        minStep: 2, // can't really test with .x precision as of floating point precision
      });

      const result = Array.from(characteristic.validValuesIterator());
      expect(result).toEqual([2, 4, 6, 8, 10]);
    });

    it ("should iterate over validValues array definition", () => {
      const validValues = [1, 3, 4, 5, 8];
      const characteristic = createCharacteristicWithProps({
        format: Formats.INT,
        perms: [Perms.PAIRED_READ],
        validValues: validValues
      });

      const result = Array.from(characteristic.validValuesIterator());
      expect(result).toEqual(validValues);
    });

    it ("should iterate over validValueRanges definition", () => {
      const characteristic = createCharacteristicWithProps({
        format: Formats.INT,
        perms: [Perms.PAIRED_READ],
        validValueRanges: [2, 5],
      });

      const result = Array.from(characteristic.validValuesIterator());
      expect(result).toEqual([2, 3, 4, 5]);
    });

    it("should iterate over UINT8 definition", () => {
      const characteristic = createCharacteristic(Formats.UINT8);

      const result = Array.from(characteristic.validValuesIterator());
      expect(result).toEqual(Array.from(new Uint8Array(256).map((value, i) => i)))
    });

    // we could do the same for UINT16, UINT32 and UINT64 but i think thats kind of pointless and takes to long
  });

  describe('#subscribe()', () => {
    it('correctly adds a single subscription', () => {
      const characteristic = createCharacteristic(Formats.BOOL);
      const subscribeSpy = jest.fn();
      characteristic.on(CharacteristicEventTypes.SUBSCRIBE, subscribeSpy);
      characteristic.subscribe();

      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      // @ts-expect-error
      expect(characteristic.subscriptions).toEqual(1);
    });

    it('correctly adds multiple subscriptions', () => {
      const characteristic = createCharacteristic(Formats.BOOL);
      const subscribeSpy = jest.fn();
      characteristic.on(CharacteristicEventTypes.SUBSCRIBE, subscribeSpy);
      characteristic.subscribe();
      characteristic.subscribe();
      characteristic.subscribe();

      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      // @ts-expect-error
      expect(characteristic.subscriptions).toEqual(3);
    });
  });

  describe('#unsubscribe()', () => {
    it('correctly removes a single subscription', () => {
      const characteristic = createCharacteristic(Formats.BOOL);
      const subscribeSpy = jest.fn();
      const unsubscribeSpy = jest.fn();
      characteristic.on(CharacteristicEventTypes.SUBSCRIBE, subscribeSpy);
      characteristic.on(CharacteristicEventTypes.UNSUBSCRIBE, unsubscribeSpy);
      characteristic.subscribe();
      characteristic.unsubscribe();

      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      // @ts-expect-error
      expect(characteristic.subscriptions).toEqual(0);
    });

    it('correctly removes multiple subscriptions', () => {
      const characteristic = createCharacteristic(Formats.BOOL);
      const subscribeSpy = jest.fn();
      const unsubscribeSpy = jest.fn();
      characteristic.on(CharacteristicEventTypes.SUBSCRIBE, subscribeSpy);
      characteristic.on(CharacteristicEventTypes.UNSUBSCRIBE, unsubscribeSpy);
      characteristic.subscribe();
      characteristic.subscribe();
      characteristic.subscribe();
      characteristic.unsubscribe();
      characteristic.unsubscribe();
      characteristic.unsubscribe();

      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      // @ts-expect-error
      expect(characteristic.subscriptions).toEqual(0);
    });
  });

  describe('#handleGetRequest()', () => {
    it('should handle special event only characteristics', (callback) => {
      const characteristic = createCharacteristic(Formats.BOOL, Characteristic.ProgrammableSwitchEvent.UUID);

      characteristic.handleGetRequest().then(() => {
        expect(characteristic.statusCode).toEqual(HAPStatus.SUCCESS);
        expect(characteristic.value).toEqual(null);
        callback();
      });
    });

    it('should return cached values if no listeners are registered', (callback) => {
      const characteristic = createCharacteristic(Formats.BOOL);

      characteristic.handleGetRequest().then(() => {
        expect(characteristic.statusCode).toEqual(HAPStatus.SUCCESS);
        expect(characteristic.value).toEqual(null);
        callback();
      });
    });
  });

  describe('#validateUserInput()', () => {

    it('should validate an integer property', () => {
      const VALUE = 1024;
      const characteristic = createCharacteristic(Formats.INT);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a float property', () => {
      const VALUE = 1.024;
      const characteristic = createCharacteristicWithProps({
        format: Formats.FLOAT,
        minStep: 0.001,
        perms: [Perms.NOTIFY],
      });
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a UINT8 property', () => {
      const VALUE = 10;
      const characteristic = createCharacteristic(Formats.UINT8);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a UINT16 property', () => {
      const VALUE = 10;
      const characteristic = createCharacteristic(Formats.UINT16);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a UINT32 property', () => {
      const VALUE = 10;
      const characteristic = createCharacteristic(Formats.UINT32);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a UINT64 property', () => {
      const VALUE = 10;
      const characteristic = createCharacteristic(Formats.UINT64);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a boolean property', () => {
      const VALUE = true;
      const characteristic = createCharacteristic(Formats.BOOL);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a string property', () => {
      const VALUE = 'Test';
      const characteristic = createCharacteristic(Formats.STRING);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a data property', () => {
      const VALUE = Buffer.from("Hello my good friend. Have a nice day!", "ascii").toString("base64");
      const characteristic = createCharacteristic(Formats.DATA);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a TLV8 property', () => {
      const VALUE = '';
      const characteristic = createCharacteristic(Formats.TLV8);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate a dictionary property', () => {
      const VALUE = {};
      const characteristic = createCharacteristic(Formats.DICTIONARY);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });

    it('should validate an array property', () => {
      const VALUE = ['asd'];
      const characteristic = createCharacteristic(Formats.ARRAY);
      // @ts-expect-error
      expect(characteristic.validateUserInput(VALUE)).toEqual(VALUE);
    });
  });

  describe('#getDefaultValue()', () => {

    it('should get the correct default value for a boolean property', () => {
      const characteristic = createCharacteristic(Formats.BOOL);
      // @ts-expect-error
      expect(characteristic.getDefaultValue()).toEqual(false);
    });

    it('should get the correct default value for a string property', () => {
      const characteristic = createCharacteristic(Formats.STRING);
      // @ts-expect-error
      expect(characteristic.getDefaultValue()).toEqual('');
    });

    it('should get the correct default value for a data property', () => {
      const characteristic = createCharacteristic(Formats.DATA);
      // @ts-expect-error
      expect(characteristic.getDefaultValue()).toEqual(null);
    });

    it('should get the correct default value for a TLV8 property', () => {
      const characteristic = createCharacteristic(Formats.TLV8);
      // @ts-expect-error
      expect(characteristic.getDefaultValue()).toEqual(null);
    });

    it('should get the correct default value for a dictionary property', () => {
      const characteristic = createCharacteristic(Formats.DICTIONARY);
      // @ts-expect-error
      expect(characteristic.getDefaultValue()).toEqual({});
    });

    it('should get the correct default value for an array property', () => {
      const characteristic = createCharacteristic(Formats.ARRAY);
      // @ts-expect-error
      expect(characteristic.getDefaultValue()).toEqual([]);
    });

  });

  describe('#toHAP()', () => {

  });

  describe(`@${CharacteristicEventTypes.GET}`, () => {

    it('should call any listeners for the event', (callback) => {
      const characteristic = createCharacteristic(Formats.STRING);

      const listenerCallback = jest.fn();

      characteristic.handleGetRequest().then(() => {
        characteristic.on(CharacteristicEventTypes.GET, listenerCallback);
        characteristic.handleGetRequest();
        expect(listenerCallback).toHaveBeenCalledTimes(1);
        callback();
      })
    });
  });

  describe("onGet handler", () => {
    it("should ignore GET event handler when onGet was specified", async () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const listenerCallback = jest.fn().mockImplementation((callback) => {
        callback(undefined, "OddValue");
      });
      const handlerMock = jest.fn();

      characteristic.onGet(() => {
        handlerMock();
        return "CurrentValue";
      });
      characteristic.on(CharacteristicEventTypes.GET, listenerCallback);
      const value = await characteristic.handleGetRequest();

      expect(value).toEqual("CurrentValue");
      expect(handlerMock).toHaveBeenCalledTimes(1);
      expect(listenerCallback).toHaveBeenCalledTimes(0);
    });
  });

  describe(`@${CharacteristicEventTypes.SET}`, () => {

    it('should call any listeners for the event', () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const VALUE = 'NewValue';
      const listenerCallback = jest.fn();

      characteristic.handleSetRequest(VALUE);
      characteristic.on(CharacteristicEventTypes.SET, listenerCallback);
      characteristic.handleSetRequest(VALUE);

      expect(listenerCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("onSet handler", () => {
    it("should ignore SET event handler when onSet was specified", () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const listenerCallback = jest.fn();
      const handlerMock = jest.fn();

      characteristic.onSet(value => {
        handlerMock(value);
        expect(value).toEqual("NewValue");
        return;
      });
      characteristic.on(CharacteristicEventTypes.SET, listenerCallback);
      characteristic.handleSetRequest("NewValue");

      expect(handlerMock).toHaveBeenCalledTimes(1);
      expect(listenerCallback).toHaveBeenCalledTimes(0);
    });
  });

  describe(`@${CharacteristicEventTypes.CHANGE}`, () => {

    it('should call listeners for the event when the characteristic is event-only, and the value is set', (callback) => {
      const characteristic = createCharacteristic(Formats.STRING, Characteristic.ProgrammableSwitchEvent.UUID);

      const VALUE = 'NewValue';
      const listenerCallback = jest.fn();
      const setValueCallback = jest.fn();

      characteristic.setValue(VALUE, () => {
        setValueCallback();

        characteristic.on(CharacteristicEventTypes.CHANGE, listenerCallback);
        characteristic.setValue(VALUE, () => {
          setValueCallback();

          expect(listenerCallback).toHaveBeenCalledTimes(1);
          expect(setValueCallback).toHaveBeenCalledTimes(2);
          callback();
        });
      })
    });

    it('should call any listeners for the event when the characteristic is event-only, and the value is updated', () => {
      const characteristic = createCharacteristic(Formats.STRING);
      // characteristic.eventOnlyCharacteristic = true;

      const VALUE = 'NewValue';
      const listenerCallback = jest.fn();
      const updateValueCallback = jest.fn();

      characteristic.on(CharacteristicEventTypes.CHANGE, listenerCallback);
      // noinspection JSDeprecatedSymbols
      characteristic.updateValue(VALUE, updateValueCallback)

      expect(listenerCallback).toHaveBeenCalledTimes(1);
      expect(updateValueCallback).toHaveBeenCalledTimes(1);
    });

    it("should call the change listener with proper context when supplied as second argument to updateValue", () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const VALUE = "NewValue";
      const CONTEXT = "Context";

      const listener = jest.fn().mockImplementation((change: CharacteristicChange) => {
        expect(change.newValue).toEqual(VALUE);
        expect(change.context).toEqual(CONTEXT);
      });

      characteristic.on(CharacteristicEventTypes.CHANGE, listener);
      characteristic.updateValue(VALUE, CONTEXT);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should call the change listener with proper context when supplied as second argument to setValue", () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const VALUE = "NewValue";
      const CONTEXT = "Context";

      const listener = jest.fn().mockImplementation((change: CharacteristicChange) => {
        expect(change.newValue).toEqual(VALUE);
        expect(change.context).toEqual(CONTEXT);
      });

      characteristic.on(CharacteristicEventTypes.CHANGE, listener);
      characteristic.setValue(VALUE, CONTEXT);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe(`@${CharacteristicEventTypes.SUBSCRIBE}`, () => {

    it('should call any listeners for the event', () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const cb = jest.fn();

      characteristic.on(CharacteristicEventTypes.SUBSCRIBE, cb);
      characteristic.subscribe();

      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe(`@${CharacteristicEventTypes.UNSUBSCRIBE}`, () => {

    it('should call any listeners for the event', () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const cb = jest.fn();

      characteristic.subscribe();
      characteristic.on(CharacteristicEventTypes.UNSUBSCRIBE, cb);
      characteristic.unsubscribe();

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should not call any listeners for the event if none are registered', () => {
      const characteristic = createCharacteristic(Formats.STRING);

      const cb = jest.fn();

      characteristic.on(CharacteristicEventTypes.UNSUBSCRIBE, cb);
      characteristic.unsubscribe();

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('#serialize', () => {
    it('should serialize characteristic', () => {
      const props: CharacteristicProps = {
        format: Formats.INT,
        perms: [Perms.TIMED_WRITE, Perms.PAIRED_READ],
        unit: Units.LUX,
        maxValue: 1234,
        minValue: 123,
        validValueRanges: [123, 1234],
        adminOnlyAccess: [Access.WRITE],
      };

      const characteristic = createCharacteristicWithProps(props, Characteristic.ProgrammableSwitchEvent.UUID);
      characteristic.value = "TestValue";

      const json = Characteristic.serialize(characteristic);
      expect(json).toEqual({
        displayName: characteristic.displayName,
        UUID: characteristic.UUID,
        props: props,
        value: "TestValue",
        eventOnlyCharacteristic: true,
      })
    });

    it("should serialize characteristic with proper constructor name", () => {
      const characteristic = new Characteristic.Name();
      characteristic.updateValue("New Name!");

      const json = Characteristic.serialize(characteristic);
      expect(json).toEqual({
        displayName: 'Name',
        UUID: '00000023-0000-1000-8000-0026BB765291',
        eventOnlyCharacteristic: false,
        constructorName: 'Name',
        value: 'New Name!',
        props: { format: 'string', perms: [ 'pr' ], maxLen: 64 }
      });
    });
  });

  describe('#deserialize', () => {
    it('should deserialize legacy json from homebridge', () => {
      const json = JSON.parse('{"displayName": "On", "UUID": "00000025-0000-1000-8000-0026BB765291", ' +
          '"props": {"format": "int", "unit": "seconds", "minValue": 4, "maxValue": 6, "minStep": 0.1, "perms": ["pr", "pw", "ev"]}, ' +
          '"value": false, "eventOnlyCharacteristic": false}');
      const characteristic = Characteristic.deserialize(json);

      expect(characteristic.displayName).toEqual(json.displayName);
      expect(characteristic.UUID).toEqual(json.UUID);
      expect(characteristic.props).toEqual(json.props);
      expect(characteristic.value).toEqual(json.value);
    });

    it('should deserialize complete json', () => {
      const json: SerializedCharacteristic = {
        displayName: "MyName",
        UUID: "00000001-0000-1000-8000-0026BB765291",
        props: {
          format: Formats.INT,
          perms: [Perms.TIMED_WRITE, Perms.PAIRED_READ],
          unit: Units.LUX,
          maxValue: 1234,
          minValue: 123,
          validValueRanges: [123, 1234],
          adminOnlyAccess: [Access.NOTIFY, Access.READ],
        },
        value: "testValue",
        eventOnlyCharacteristic: false,
      };

      const characteristic = Characteristic.deserialize(json);

      expect(characteristic.displayName).toEqual(json.displayName);
      expect(characteristic.UUID).toEqual(json.UUID);
      expect(characteristic.props).toEqual(json.props);
      expect(characteristic.value).toEqual(json.value);
    });

    it("should deserialize from json with constructor name", () => {
      const json: SerializedCharacteristic = {
        displayName: 'Name',
        UUID: '00000023-0000-1000-8000-0026BB765291',
        eventOnlyCharacteristic: false,
        constructorName: 'Name',
        value: 'New Name!',
        props: { format: 'string', perms: [ Perms.PAIRED_READ ], maxLen: 64 }
      };

      const characteristic = Characteristic.deserialize(json);

      expect(characteristic instanceof Characteristic.Name).toBeTruthy();
    });
  });
});
