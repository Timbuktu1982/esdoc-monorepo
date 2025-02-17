export default class MyClass {
  /**
   * method1 is default access.
   */
  method1(){}

  /**
   * method2 is public.
   * @public
   */
  method2(){}

  /**
   * method3 is protected.
   * @protected
   */
  method3(){}

  /**
   * method4 is private.
   * @private
   */
  method4(){}

  /**
   * method5 is auto private.
   */
  _method5(){}

  /**
   * unnamed method.
   */
  function(){}
}

/**
  * unnamed method.
  */
MyClass.prototype["@@iterator"] = function(){
  return this;
}

/**
  * unnamed arrow method.
  */
MyClass.prototype["@@asyncIterator"] = () => {
  return undefined;
}
