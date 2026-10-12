package io.swagger.v3.oas.annotations;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface Operation { String summary() default ""; String description() default ""; String operationId() default ""; }
