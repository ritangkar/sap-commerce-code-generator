package io.swagger.annotations;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface ApiOperation { String value(); String notes() default ""; String nickname() default ""; }
