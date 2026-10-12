package io.swagger.v3.oas.annotations.responses;

@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface ApiResponse { String responseCode(); String description() default ""; }
