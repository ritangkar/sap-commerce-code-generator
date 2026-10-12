package io.swagger.v3.oas.annotations;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface Parameter { String description() default ""; boolean required() default false; }
