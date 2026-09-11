/*
    El plugin NO tiene configuracion: credenciales, region, intervalo y tope del historico viven todos
    en el provider. Estas clases existen porque el contrato del canal las pide, y quedan vacias a
    proposito — si algun dia el grafico gana opciones de presentacion (una ventana visible, por
    ejemplo), este es su sitio, y seguirian sin ser configuracion del provider.
*/
export interface ISugarlessConfig {}

export class SugarlessConfig implements ISugarlessConfig {}

export interface ISugarlessInstanceConfig {}

export class SugarlessInstanceConfig implements ISugarlessInstanceConfig {}
